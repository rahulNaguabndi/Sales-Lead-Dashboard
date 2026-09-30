import type { Role } from '@leaddesk/shared';

export type NavIcon = 'inbox' | 'pipeline' | 'dashboard' | 'offers' | 'settings' | 'audit';

export type NavItem = { href: string; label: string; icon: NavIcon; roles: Role[] };

const ALL: Role[] = ['REP', 'MANAGER', 'VP'];
const LEADERS: Role[] = ['MANAGER', 'VP'];

/** Append-only nav config: features add their entry here, they never reorder others. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/inbox', label: 'Inbox', icon: 'inbox', roles: ALL },
  { href: '/pipeline', label: 'Pipeline', icon: 'pipeline', roles: ALL },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ALL },
  { href: '/offers', label: 'Offers', icon: 'offers', roles: ALL },
  { href: '/team/settings', label: 'Team Settings', icon: 'settings', roles: LEADERS },
  { href: '/audit', label: 'Audit', icon: 'audit', roles: LEADERS },
];

export function getNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
