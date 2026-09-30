import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, SESSION_COOKIE } from '@/server/auth/constants';
import { verifySession } from '@/server/auth/jwt';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function errorJson(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function originOk(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients (curl, server-to-server) send no Origin
  const host = req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const isIntake = pathname === '/api/intake' || pathname.startsWith('/api/intake/');

  if (isApi && !isIntake && MUTATING.has(req.method) && !originOk(req)) {
    return errorJson(403, 'BAD_ORIGIN', 'Cross-origin request rejected');
  }
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();

  if (isApi) {
    const res = errorJson(401, 'UNAUTHENTICATED', 'Authentication required');
    if (token) res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', `${pathname}${search}`);
  if (token) url.searchParams.set('expired', '1');
  const res = NextResponse.redirect(url);
  if (token) res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
