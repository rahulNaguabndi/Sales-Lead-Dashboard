import type { Role } from '@leaddesk/shared';

// Edge-safe (imported by middleware.ts). Mirrors the LEADERS entries in components/layout/nav.ts;
// pages still check the policy layer, this only gives REPs a consistent 403 page and status.
const LEADER_ONLY_PAGES = ['/team', '/audit', '/dashboard/demographics'];

export function isForbiddenPage(pathname: string, role: Role): boolean {
  if (role !== 'REP') return false;
  return LEADER_ONLY_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
