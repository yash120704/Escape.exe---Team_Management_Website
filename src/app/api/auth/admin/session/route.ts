import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const cookieStore = await cookies();
  const adminSession = cookieStore.get('admin-session');

  if (!adminSession?.value) {
    return NextResponse.json({ isAuthenticated: false }, { status: 401 });
  }

  try {
    const session = JSON.parse(adminSession.value);
    
    if (!session.id || !session.username) {
      return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    // Verify admin exists
    const client = supabaseAdmin || supabase;
    const { data: admin, error } = await client
      .from('admin')
      .select('id, username')
      .eq('id', session.id)
      .eq('username', session.username)
      .single();

    if (error || !admin) {
      return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    return NextResponse.json({ 
      isAuthenticated: true,
      admin: { username: admin.username }
    });

  } catch (error) {
    return NextResponse.json({ isAuthenticated: false }, { status: 401 });
  }
}
