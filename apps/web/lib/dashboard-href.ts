import type { DashboardFilters, DashboardPeriod } from '@leaddesk/shared';

type Extra = Partial<
  Record<'owner' | 'team' | 'stage' | 'overdue' | 'sla' | 'sourceGroup' | 'source' | 'view', string>
>;

/** Inbox deep link carrying the dashboard's filters so the destination count matches the widget. */
export function buildInboxHref(
  filters: Pick<DashboardFilters, 'teamId' | 'ownerId' | 'sourceGroup'>,
  period: Pick<DashboardPeriod, 'fromDate' | 'toDate'> | null,
  extra: Extra = {},
): string {
  const sp = new URLSearchParams();
  if (period) {
    sp.set('createdFrom', period.fromDate);
    sp.set('createdTo', period.toDate);
  }
  const team = extra.team ?? filters.teamId;
  const owner = extra.owner ?? filters.ownerId;
  const sourceGroup = extra.sourceGroup ?? filters.sourceGroup;
  if (team) sp.set('team', team);
  if (owner) sp.set('owner', owner);
  if (sourceGroup) sp.set('sourceGroup', sourceGroup);
  for (const k of ['stage', 'overdue', 'sla', 'source', 'view'] as const) {
    const v = extra[k];
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/inbox?${qs}` : '/inbox';
}
