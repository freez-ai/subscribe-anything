import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password', '/api/auth'];
const STATIC_PATHS = ['/_next', '/favicon', '/icon', '/images'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static resources and public paths
  if (STATIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = req.cookies.get('subscribe_session');

  if (!session) {
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page routes redirect to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|images).*)'],
};
