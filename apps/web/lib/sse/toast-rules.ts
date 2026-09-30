import type { LeadDeskEvent, LeadSummary } from '@leaddesk/shared';

export type ToastDecision =
  | {
      kind: 'assigned-to-me';
      leadId: string;
      hot: boolean;
      durationMs: number;
      summary: LeadSummary | null;
    }
  | { kind: 'pool'; leadId: string; summary: LeadSummary }
  | { kind: 'reassigned-away'; leadId: string }
  | { kind: 'followup-due'; leadId: string }
  | null;

export const POOL_GROUP_WINDOW_MS = 10_000;
export const POOL_GROUP_THRESHOLD = 3;

function assigned(leadId: string, summary: LeadSummary | null): ToastDecision {
  const hot = summary?.priority === 'HOT';
  return { kind: 'assigned-to-me', leadId, hot, durationMs: hot ? 8000 : 5000, summary };
}

/** Pure decision: which toast (if any) an event produces for `me`. */
export function decideToast(
  e: LeadDeskEvent,
  me: string,
  summaries: ReadonlyMap<string, LeadSummary>,
): ToastDecision {
  if (e.type === 'followup.due')
    return e.ownerId === me ? { kind: 'followup-due', leadId: e.leadId } : null;
  if (e.by === me) return null;
  if (e.type === 'lead.created') {
    if (e.ownerId === me) return assigned(e.lead.id, e.lead);
    return e.ownerId === null ? { kind: 'pool', leadId: e.lead.id, summary: e.lead } : null;
  }
  if (e.type === 'lead.assigned') {
    if (e.toOwnerId === me) return assigned(e.leadId, summaries.get(e.leadId) ?? null);
    if (e.fromOwnerId === me) return { kind: 'reassigned-away', leadId: e.leadId };
  }
  return null;
}

/** Pool arrivals are grouped once more than 3 land within 10 s. */
export function shouldGroupPool(arrivals: readonly number[], now: number): boolean {
  return arrivals.filter((t) => now - t <= POOL_GROUP_WINDOW_MS).length > POOL_GROUP_THRESHOLD;
}
