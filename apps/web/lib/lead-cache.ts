import type { QueryClient } from '@tanstack/react-query';
import type { LeadListItem, LeadListResult } from '@/server/services/lead-query';

/** Every query a lead mutation (claim, assign, stage, activity) can make stale. */
export function invalidateLeadData(client: QueryClient, leadId?: string): void {
  const keys: unknown[][] = [['leads'], ['pipeline'], ['dashboard'], ['followups']];
  if (leadId) keys.push(['lead', leadId]);
  for (const queryKey of keys) void client.invalidateQueries({ queryKey });
}

type BoardPages = { pages: LeadListResult[]; pageParams: unknown[] };
type Patch = (item: LeadListItem) => LeadListItem | null;

const isList = (v: unknown): v is LeadListResult =>
  !!v && typeof v === 'object' && Array.isArray((v as LeadListResult).items);
const isPages = (v: unknown): v is BoardPages =>
  !!v && typeof v === 'object' && Array.isArray((v as BoardPages).pages);

function patchList(list: LeadListResult, leadId: string, patch: Patch): LeadListResult {
  let removed = 0;
  const items = list.items.flatMap((i) => {
    if (i.id !== leadId) return [i];
    const next = patch(i);
    if (next === null) removed++;
    return next ? [next] : [];
  });
  return { ...list, items, total: list.total - removed };
}

/**
 * Applies `patch` to the lead in every cached inbox list and board column (returning null drops
 * the row), so the UI reflects a mutation before the server round trip or SSE event lands.
 */
export function patchCachedLead(client: QueryClient, leadId: string, patch: Patch): void {
  for (const [key, data] of client.getQueriesData({ queryKey: ['leads'] })) {
    if (isList(data)) client.setQueryData(key, patchList(data, leadId, patch));
    else if (isPages(data))
      client.setQueryData(key, {
        ...data,
        pages: data.pages.map((p) => (isList(p) ? patchList(p, leadId, patch) : p)),
      });
  }
}

/** Optimistic claim: the lead leaves "Unassigned" views and moves to "My Leads" in the counts. */
export function applyOptimisticClaim(
  client: QueryClient,
  leadId: string,
  me: { id: string; name: string; avatarColor?: string },
): void {
  for (const [key, data] of client.getQueriesData({ queryKey: ['leads'] })) {
    // Tab counts are per user, not per list, so every cached list gets the same adjustment.
    const bump = (l: LeadListResult): LeadListResult => {
      const owner = { id: me.id, name: me.name, avatarColor: me.avatarColor ?? '#2563eb' };
      const patched = patchList(l, leadId, (i) =>
        l.view === 'unassigned' ? null : { ...i, owner },
      );
      return {
        ...patched,
        counts: {
          ...l.counts,
          unassigned: Math.max(0, l.counts.unassigned - 1),
          mine: l.counts.mine + 1,
        },
      };
    };
    if (isList(data)) client.setQueryData(key, bump(data));
    else if (isPages(data))
      client.setQueryData(key, {
        ...data,
        pages: data.pages.map((p) => (isList(p) ? bump(p) : p)),
      });
  }
}
