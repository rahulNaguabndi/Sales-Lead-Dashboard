import type { Role } from '@leaddesk/shared';

export type DashboardTab = { id: string; label: string; href: string; roles: Role[] };

const LEADERS: Role[] = ['MANAGER', 'VP'];

/** Append-only dashboard tab registry: features add their entry, they never reorder others. */
export const DASHBOARD_TABS: DashboardTab[] = [
  { id: 'demographics', label: 'Demographics', href: '/dashboard/demographics', roles: LEADERS },
];

export function getDashboardTabs(role: Role): DashboardTab[] {
  return DASHBOARD_TABS.filter((t) => t.roles.includes(role));
}
