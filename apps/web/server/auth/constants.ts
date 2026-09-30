// Edge-safe: imported by middleware.ts, so no Node-only imports here.
export const SESSION_COOKIE = 'ld_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const CLOCK_TOLERANCE_SECONDS = 30;

export const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/intake',
  '/_next',
  '/favicon.ico',
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
