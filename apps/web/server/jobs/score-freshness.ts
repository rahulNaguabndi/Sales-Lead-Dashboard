import { inArray } from 'drizzle-orm';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { db } from '../db/client';
import { leads } from '../db/schema';
import { bus } from '../events/bus';
import { freshScores } from './deps';

/** FR-012: F08 schedules F09's freshness recompute and announces priority changes. */
export async function runScoreFreshness(
  o: { now?: number; publish?: (e: LeadDeskEvent) => Promise<void> | void } = {},
): Promise<{ priorityChanged: number }> {
  const now = o.now ?? Date.now();
  const publish = o.publish ?? ((e: LeadDeskEvent) => bus.publish(e));
  const { priorityChangedIds } = freshScores(now);
  if (priorityChangedIds.length === 0) return { priorityChanged: 0 };
  const rows = db.select().from(leads).where(inArray(leads.id, priorityChangedIds)).all();
  for (const l of rows) {
    try {
      await publish({
        type: 'lead.updated',
        at: now,
        teamId: l.teamId,
        ownerId: l.ownerId,
        by: null,
        leadId: l.id,
        changes: { score: l.score, priority: l.priority },
      });
    } catch (err) {
      console.warn('[jobs] score-freshness: publish failed:', (err as Error).message);
    }
  }
  return { priorityChanged: rows.length };
}
