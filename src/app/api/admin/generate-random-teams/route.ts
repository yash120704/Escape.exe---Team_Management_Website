import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_EVENT } from '@/lib/types';

// GET: List unassigned users for a given event key
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const event = searchParams.get('event') || 'escape-exe-ii';

    // 1) Gather all users from users table
    const client = supabaseAdmin || supabase;
    const { data: allUsers, error: usersError } = await client
      .from('users')
      .select('id, name, email');
    if (usersError) {
      return NextResponse.json({ message: 'Error fetching users.' }, { status: 500 });
    }

    // 2) Gather registered users for the event
    const { data: registrations, error: regError } = await client
      .from('event_registration')
      .select('user_email')
      .eq('event_key', event);
    if (regError) {
      return NextResponse.json({ message: 'Error fetching event registrations.', supabaseError: regError }, { status: 500 });
    }
    const registeredEmails = new Set(
      (registrations || []).map((r: any) => String(r.user_email).toLowerCase())
    );

    // 3) Find all team member ids for this event
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('id, members')
      .eq('event', event);
    if (teamsError) {
      return NextResponse.json({ message: 'Error fetching teams.' }, { status: 500 });
    }
    const memberSet = new Set<string>();
    (teams || []).forEach((t: any) => {
      (t.members || []).forEach((m: any) => memberSet.add(m.id));
    });

    // 4) Build list of unassigned user ids (user exists && registered && not in team)
    const unassignedUsers = (allUsers || []).filter((u: any) => registeredEmails.has(String(u.email).toLowerCase()) && !memberSet.has(u.id));

    return NextResponse.json({ event, unassignedUsers });
  } catch (error) {
    return NextResponse.json({ message: 'Internal server error', error: String(error) }, { status: 500 });
  }
}

// POST: Generate random teams from participants in the random pool
export async function POST(request: NextRequest) {
  try {
    const { teamSize = 4, event } = await request.json().catch(() => ({ teamSize: 4 }));
    const effectiveEvent = event || DEFAULT_EVENT;

    // 1. Get users from random pool (with event_date)
    const client = supabaseAdmin || supabase;
    const { data: poolUsers, error: poolError } = await client
      .from('random_pool')
      .select('*')
      .eq('event', effectiveEvent);

    if (poolError) {
      return NextResponse.json({ message: 'Error fetching random pool users.', error: poolError }, { status: 500 });
    }

    if (!poolUsers || poolUsers.length === 0) {
      return NextResponse.json({ message: 'No users in random pool to assign.' }, { status: 400 });
    }

    // 2. Get all users' details
    const { data: allUsers, error: usersError } = await client
      .from('users')
      .select('id, name, email')
      .in('id', poolUsers.map(pu => pu.user_id));

    if (usersError || !allUsers) {
      return NextResponse.json({ message: 'Error fetching users.' }, { status: 500 });
    }

    // 3. Get all teams for this event
    const { data: teams, error: teamsError } = await client
      .from('teams')
      .select('*')
      .eq('event', effectiveEvent);

    if (teamsError) {
      return NextResponse.json({ message: 'Error fetching teams.' }, { status: 500 });
    }

    // Map pool users to their full details and keep event_date
    type PoolUser = { id: string; name: string; email: string; event_date: string };
    const poolUsersWithDetails: PoolUser[] = poolUsers.map(pu => {
      const user = allUsers.find(u => u.id === pu.user_id);
      if (!user) return null;
      return { id: user.id, name: user.name, email: user.email, event_date: pu.event_date } as PoolUser;
    }).filter(Boolean) as PoolUser[];

    // 4. Filter out users who are already in teams (CRITICAL FIX)
    const memberSet = new Set<string>();
    (teams || []).forEach((t: any) => {
      (t.members || []).forEach((m: any) => memberSet.add(m.id));
    });

    const unassignedUsers: PoolUser[] = poolUsersWithDetails.filter(user => !memberSet.has(user.id));
    
    // Log skipped users for debugging
    const skippedUsers = poolUsersWithDetails.filter(user => memberSet.has(user.id));
    if (skippedUsers.length > 0) {
      console.log(`Skipped ${skippedUsers.length} users already in teams:`, skippedUsers.map(u => u.name));
    }

    const createdTeamIds: string[] = [];
    const assignedToExisting: any[] = [];
    const failed: any[] = [];

    // 4. First try to fill existing teams that have open slots, date-matched
    for (const team of (teams || [])) {
      const members = team.members || [];
      const slots = teamSize - members.length;
      if (slots <= 0) continue;

      // Only pick users with same event_date as team
      const sameDateUsersIdx: number[] = [];
      for (let i = 0; i < unassignedUsers.length && sameDateUsersIdx.length < slots; i++) {
        if (unassignedUsers[i].event_date === team.event_date) {
          sameDateUsersIdx.push(i);
        }
      }
      if (!sameDateUsersIdx.length) continue;

      // Extract chosen users and remove from list
      const toAssign = sameDateUsersIdx.map((idx, k) => unassignedUsers[idx]).filter(Boolean);
      // Remove by index from unassignedUsers (in reverse to keep indices valid)
      sameDateUsersIdx.sort((a,b)=>b-a).forEach(idx => unassignedUsers.splice(idx,1));

      const newMembers = [...members, ...toAssign.map((u: PoolUser) => ({ id: u.id, name: u.name, email: u.email }))];

      const { error: updateErr } = await client
        .from('teams')
        .update({ members: newMembers })
        .eq('id', team.id);

      if (updateErr) {
        failed.push({ teamId: team.id, error: updateErr });
        // Put back users if update failed
        unassignedUsers.push(...toAssign);
        continue;
      }

      assignedToExisting.push({ teamId: team.id, added: toAssign.map((u: PoolUser) => u.id) });

      // Remove assigned users from random pool (date-scoped)
      for (const user of toAssign) {
        await client
          .from('random_pool')
          .delete()
          .eq('user_id', user.id)
          .eq('event', effectiveEvent)
          .eq('event_date', user.event_date as any);
      }
    }

    // 5. If we have 2 or more users left, create new teams
    if (unassignedUsers.length >= 2) {
      // Group remaining users by event_date and create teams per date
      const byDate = new Map<string, PoolUser[]>();
      for (const u of unassignedUsers) {
        const arr = byDate.get(u.event_date) || [];
        arr.push(u);
        byDate.set(u.event_date, arr);
      }
      for (const [dateKey, arr] of byDate.entries()) {
        for (let i = 0; i < arr.length; i += teamSize) {
          const slice = arr.slice(i, i + teamSize);
          if (slice.length < 2) break;

          const members = slice.map((u: PoolUser) => ({ id: u.id, name: u.name, email: u.email }));
          const leaderIndex = Math.floor(Math.random() * members.length);
          const leaderId = members[leaderIndex].id;
          const teamName = `Team ${Date.now()}-${i / teamSize + 1}`;

          const { data: created, error: insertError } = await client
            .from('teams')
            .insert({
              name: teamName,
              leader_id: leaderId,
              members,
              score: 0,
              event: effectiveEvent,
              event_date: dateKey,
            })
            .select()
            .single();

          if (insertError || !created) {
            failed.push({ users: slice, error: insertError });
            continue;
          }

          createdTeamIds.push(created.id);

          for (const user of slice) {
            await client
              .from('random_pool')
              .delete()
              .eq('user_id', user.id)
              .eq('event', effectiveEvent)
              .eq('event_date', dateKey as any);
          }
        }
      }
    }

    return NextResponse.json({
      message: 'Random allotment complete.',
      createdTeamIds,
      assignedToExisting,
      failed
    });

  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred.', error: String(error) }, { status: 500 });
  }
}
