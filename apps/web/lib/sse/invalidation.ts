import type { LeadDeskEvent } from '@leaddesk/shared';

export type QueryKey = readonly unknown[];

export const KEY_DEBOUNCE_MS = 250;
export const DASHBOARD_DEBOUNCE_MS = 5000;

/** FR-011: which query keys an event invalidates. */
export function keysFor(e: LeadDeskEvent): QueryKey[] {
  switch (e.type) {
    case 'lead.created':
      return [['leads'], ['followups'], ['dashboard']];
    case 'lead.assigned':
      return [['leads'], ['followups'], ['dashboard'], ['lead', e.leadId]];
    case 'lead.updated':
      return [['lead', e.leadId], ['leads'], ['pipeline'], ['dashboard']];
    case 'activity.created':
      return [['lead', e.leadId, 'activities'], ['leads'], ['followups']];
    case 'followup.due':
      return [['followups']];
    case 'offer.changed':
      return [['offers'], ['lead']];
  }
}

export type Invalidator = { invalidateQueries(filter?: { queryKey: QueryKey }): unknown };

/** Debounces invalidations per key (250 ms; 5 s for dashboard keys). */
export function createInvalidator(client: Invalidator) {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const invalidate = (key: QueryKey) => {
    const id = JSON.stringify(key);
    if (pending.has(id)) return;
    const wait = key[0] === 'dashboard' ? DASHBOARD_DEBOUNCE_MS : KEY_DEBOUNCE_MS;
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        void client.invalidateQueries({ queryKey: key });
      }, wait),
    );
  };
  return {
    invalidate,
    handle(e: LeadDeskEvent) {
      keysFor(e).forEach(invalidate);
    },
    all() {
      void client.invalidateQueries();
    },
    dispose() {
      pending.forEach(clearTimeout);
      pending.clear();
    },
  };
}
