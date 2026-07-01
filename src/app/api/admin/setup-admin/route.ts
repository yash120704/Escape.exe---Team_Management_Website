import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/passwords';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getProvidedSetupToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }

  return request.nextUrl.searchParams.get('token');
}

function validateSetupRequest(request: NextRequest) {
  const configuredToken = process.env.ADMIN_SETUP_TOKEN;

  if (process.env.NODE_ENV === 'production' && !configuredToken) {
    return NextResponse.json(
      { error: 'ADMIN_SETUP_TOKEN must be configured before setup-admin can run in production.' },
      { status: 500 }
    );
  }

  if (configuredToken && getProvidedSetupToken(request) !== configuredToken) {
    return NextResponse.json({ error: 'Unauthorized setup request.' }, { status: 401 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const setupError = validateSetupRequest(request);
    if (setupError) {
      return setupError;
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY must be configured for admin setup.' },
        { status: 500 }
      );
    }

    const { data: adminCount, error: countError } = await supabaseAdmin
      .from('admin')
      .select('*', { count: 'exact' });

    if (countError) {
      console.error('Error checking admin table:', countError);
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    if (!adminCount || adminCount.length === 0) {
      const username = process.env.ADMIN_USERNAME;
      const password = process.env.ADMIN_PASSWORD;

      if (!username || !password) {
        return NextResponse.json(
          { error: 'ADMIN_USERNAME and ADMIN_PASSWORD are required to create the first admin.' },
          { status: 500 }
        );
      }

      const passwordHash = await hashPassword(password);

      const { error: createError } = await supabaseAdmin
        .from('admin')
        .insert([{ username, password: passwordHash }])
        .select()
        .single();

      if (createError) {
        console.error('Error creating default admin:', createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      return NextResponse.json({ 
        message: 'Default admin created',
        username
      });
    }

    return NextResponse.json({ message: 'Admin users exist', count: adminCount.length });
  } catch (error) {
    console.error('Error in setup-admin:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
