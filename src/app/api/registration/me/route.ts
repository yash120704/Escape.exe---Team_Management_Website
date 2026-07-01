import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_EVENT } from '@/lib/types';
import { isAllowedEmailDomain, REQUIRED_EMAIL_DOMAIN } from '@/lib/auth-domain';

// GET ?userEmail=... -> returns { event_date }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get('userEmail');
  const event = searchParams.get('event') || DEFAULT_EVENT;

  if (!userEmail) {
    return NextResponse.json({ message: 'Missing userEmail.' }, { status: 400 });
  }

  const client = supabaseAdmin || supabase;
  const normalized = userEmail.toLowerCase().trim();

  if (!isAllowedEmailDomain(normalized)) {
    return NextResponse.json(
      { message: `Only @${REQUIRED_EMAIL_DOMAIN} accounts are allowed.` },
      { status: 403 }
    );
  }

  const { data, error } = await client
    .from('event_registration')
    .select('event_date')
    .eq('event_key', event)
    .ilike('user_email', normalized)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: 'Error fetching registration.' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ message: 'Registration not found.' }, { status: 404 });
  }

  return NextResponse.json({ event_date: data.event_date });
}


