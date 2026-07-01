import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isAllowedEmailDomain, REQUIRED_EMAIL_DOMAIN } from '@/lib/auth-domain';
import { hashPassword, isBcryptHash, toPublicUser, verifyPassword } from '@/lib/passwords';

export const runtime = 'nodejs';
import type { User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { identifier, email, password, google, name } = await request.json();

    if (google) {
      // Google OAuth flow
      if (!email) {
        return NextResponse.json({ message: 'Missing email from Google login.' }, { status: 400 });
      }
      // Check if email is registered for any event (case-insensitive)
      const client = supabaseAdmin || supabase;
      const normalizedEmail = (email || '').trim().toLowerCase();
      if (!isAllowedEmailDomain(normalizedEmail)) {
        return NextResponse.json(
          { message: `Only @${REQUIRED_EMAIL_DOMAIN} accounts are allowed.` },
          { status: 403 }
        );
      }

      let { data: regData } = await client
        .from('event_registration')
        .select('*')
        .ilike('user_email', normalizedEmail);

      if (!regData || regData.length === 0) {
        return NextResponse.json({ message: 'You are not registered for any event.' }, { status: 403 });
      }
      // Upsert user in users table (normalize email lower-case)
      const { data: user, error: userError } = await client
        .from('users')
        .upsert({ email: normalizedEmail, name }, { onConflict: 'email' })
        .select()
        .single();
      if (userError) {
        return NextResponse.json({ message: 'Error creating user.' }, { status: 500 });
      }

      // Add user to random pool if not already in a team
      const { data: userTeams } = await client
        .from('teams')
        .select('id')
        .contains('members', [{ id: user.id }]);

      if (!userTeams || userTeams.length === 0) {
        // Add to random pool if not already there, include event_date when available
        const { data: existingPool } = await client
          .from('random_pool')
          .select('id')
          .eq('user_id', user.id)
          .eq('event', regData?.[0]?.event_key)
          .maybeSingle();

        if (!existingPool) {
          const { error: poolError } = await client
            .from('random_pool')
            .insert({
              user_id: user.id,
              user_name: user.name,
              user_email: user.email.toLowerCase(),
              event: regData?.[0]?.event_key,
              event_date: regData?.[0]?.event_date || null,
            });
          if (poolError) {
            console.error('Error adding user to random pool:', poolError);
          }
        }
      }

      // Auto-enqueue user into random pool if not in any team
      const { data: existingTeams } = await client
        .from('teams')
        .select('id')
        .contains('members', [{ email: normalizedEmail }]);
      if (!existingTeams || existingTeams.length === 0) {
        const { data: reg } = await client
          .from('event_registration')
          .select('*')
          .ilike('user_email', normalizedEmail)
          .maybeSingle();
        if (reg?.event_date && reg?.event_key === 'escape-exe-ii') {
          await client
            .from('random_pool')
            .upsert({
              user_id: user.id,
              user_name: user.name,
              user_email: user.email,
              event: 'escape-exe-ii',
              event_date: reg.event_date,
            }, { onConflict: 'user_id,event' as any });
        }
      }
      return NextResponse.json({ message: `Welcome, ${user.name}!`, user: toPublicUser(user) }, { status: 200 });
    } else {
      // Identifier-based password login (username/email/reg number)
      if (!identifier || !password) {
        return NextResponse.json({ message: 'Missing identifier or password.' }, { status: 400 });
      }

      let foundUser: User | null = null;
      const client = supabaseAdmin || supabase;
      const normalizedIdentifier = String(identifier).trim();

      // Identifier is an email
      if (typeof normalizedIdentifier === 'string' && normalizedIdentifier.includes('@')) {
        const { data, error } = await client
          .from('users')
          .select('id, name, email, username, password')
          .eq('email', normalizedIdentifier.toLowerCase())
          .single();
        if (!error && data) foundUser = data as unknown as User;
      }

      // Try by username if not found and identifier has no '@'
      if (!foundUser && typeof normalizedIdentifier === 'string' && !normalizedIdentifier.includes('@')) {
        const { data, error } = await client
          .from('users')
          .select('id, name, email, username, password')
          .eq('username', normalizedIdentifier)
          .maybeSingle();
        if (!error && data) foundUser = data as unknown as User;
      }

      // Try by registration number (via event_registration -> email)
      if (!foundUser && typeof normalizedIdentifier === 'string' && !normalizedIdentifier.includes('@')) {
        const { data: reg } = await client
          .from('event_registration')
          .select('user_email')
          .eq('reg_no', normalizedIdentifier)
          .maybeSingle();
        if (reg?.user_email) {
          const { data } = await client
            .from('users')
            .select('id, name, email, username, password')
            .eq('email', reg.user_email.toLowerCase())
            .maybeSingle();
          if (data) foundUser = data as unknown as User;
        }
      }

      if (!foundUser) {
        return NextResponse.json({ message: 'User not found.' }, { status: 404 });
      }

      if (!isAllowedEmailDomain(foundUser.email)) {
        return NextResponse.json(
          { message: `Only @${REQUIRED_EMAIL_DOMAIN} accounts are allowed.` },
          { status: 403 }
        );
      }

      const passwordIsValid = await verifyPassword(password, foundUser.password);
      if (!passwordIsValid) {
        return NextResponse.json({ message: 'Invalid password.' }, { status: 401 });
      }

      if (foundUser.password && !isBcryptHash(foundUser.password)) {
        const passwordHash = await hashPassword(password);
        await client
          .from('users')
          .update({ password: passwordHash })
          .eq('id', foundUser.id);
        foundUser.password = passwordHash;
      }

      // Auto-enqueue on basic login if user is teamless
      const { data: existingTeams2 } = await client
        .from('teams')
        .select('id')
        .contains('members', [{ email: foundUser.email.toLowerCase() }]);
      if (!existingTeams2 || existingTeams2.length === 0) {
        const { data: reg2 } = await client
          .from('event_registration')
          .select('*')
          .eq('user_email', foundUser.email.toLowerCase())
          .maybeSingle();
        if (reg2?.event_date && reg2?.event_key === 'escape-exe-ii') {
          await client
            .from('random_pool')
            .upsert({
              user_id: foundUser.id,
              user_name: foundUser.name,
              user_email: foundUser.email,
              event: 'escape-exe-ii',
              event_date: reg2.event_date,
            }, { onConflict: 'user_id,event' as any });
        }
      }
      return NextResponse.json({ message: `Welcome back, ${foundUser.name}!`, user: toPublicUser(foundUser) }, { status: 200 });
    }
  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
