import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
 
export const config = {
  matcher: ['/admin/:path*']
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path === '/admin/login' || path.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const adminSession = request.cookies.get('admin-session');
  
  if (!adminSession?.value) {
    const url = new URL('/admin/login', request.url);
    return NextResponse.redirect(url);
  }

  try {
    // Verify the session data is valid JSON
    const session = JSON.parse(adminSession.value);
    if (!session.username) {
      const url = new URL('/admin/login', request.url);
      return NextResponse.redirect(url);
    }
  } catch {
    const url = new URL('/admin/login', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
