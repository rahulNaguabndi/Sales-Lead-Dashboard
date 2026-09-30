/** Append-only registry of dashboard tabs (F17 adds a Demographics tab here). */
export type DashboardTab = { id: string; label: string; roles: readonly string[] };

export const DASHBOARD_TABS: DashboardTab[] = [
  { id: 'overview', label: 'Overview', roles: ['rep', 'manager', 'vp'] },
];

export const tabsFor = (layout: string): DashboardTab[] =>
  DASHBOARD_TABS.filter((t) => t.roles.includes(layout));
