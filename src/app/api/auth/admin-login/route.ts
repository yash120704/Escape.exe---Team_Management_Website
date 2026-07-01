import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import type { AdminUser } from '@/lib/types';
import { hashPassword, isBcryptHash, verifyPassword } from '@/lib/passwords';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ message: 'Missing username or password.' }, { status: 400 });
    }

    if (process.env.NODE_ENV === 'production' && !supabaseAdmin) {
      return NextResponse.json(
        { message: 'Admin authentication is not configured.' },
        { status: 500 }
      );
    }

    const client = supabaseAdmin || supabase;
    const { data: admin, error } = await client
      .from('admin')
      .select('id, username, password')
      .eq('username', username)
      .single();

    const passwordIsValid = admin ? await verifyPassword(password, admin.password) : false;
    if (error || !admin || !passwordIsValid) {
      return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
    }

    if (!isBcryptHash(admin.password)) {
      const passwordHash = await hashPassword(password);
      await client
        .from('admin')
        .update({ password: passwordHash })
        .eq('id', admin.id);
    }

    const sessionData: Pick<AdminUser, 'id' | 'username'> & { timestamp: number } = {
      username: admin.username,
      id: admin.id,
      timestamp: Date.now()
    };

    const response = NextResponse.json(
      { 
        message: 'Admin login successful.',
        admin: { username: admin.username }
      },
      { status: 200 }
    );

    response.cookies.set({
      name: 'admin-session',
      value: JSON.stringify(sessionData),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return response;

  } catch {
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
