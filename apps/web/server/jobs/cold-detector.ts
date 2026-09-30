import { and, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  OPEN_STAGES,
  ruleConfigFromEnv,
  shouldAutoCold,
  type FollowUpRuleConfig,
  type LeadDeskEvent,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, withTx } from '../db/client';
import { activities, followUps, leads } from '../db/schema';
import { bus } from '../events/bus';
import { loadStageTransition } from './deps';

export const COLD_BATCH_LIMIT = 200;
const DAY_MS = 86_400_000;

export type ColdDetectorOpts = {
  now?: number;
  cfg?: FollowUpRuleConfig;
  publish?: (e: LeadDeskEvent) => Promise<void> | void;
};

/** FR-006: moves stale open leads to COLD, one transaction per lead, at most 200 per run. */
export async function runColdDetector(
  o: ColdDetectorOpts = {},
): Promise<{ cold: number; failed: number }> {
  const now = o.now ?? Date.now();
  const cfg = o.cfg ?? ruleConfigFromEnv();
  const publish = o.publish ?? ((e: LeadDeskEvent) => bus.publish(e));
  const transition = await loadStageTransition();

  const idleSince = sql`coalesce(${leads.lastContactAt}, ${leads.createdAt})`;
  const futureFollowUp = sql`EXISTS (SELECT 1 FROM follow_ups f WHERE f.lead_id = ${leads.id} AND f.status = 'PENDING' AND f.due_at > ${now})`;
  const candidates = db
    .select()
    .from(leads)
    .where(
      and(
        inArray(leads.stage, [...OPEN_STAGES]),
        or(
          sql`${leads.attemptCount} >= ${cfg.coldAfterUnanswered}`,
          and(sql`${idleSince} <= ${now - cfg.coldAfterDays * DAY_MS}`, sql`NOT ${futureFollowUp}`),
        ),
      ),
    )
    .orderBy(idleSince)
    .limit(COLD_BATCH_LIMIT)
    .all();

  let cold = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      const out = withTx((tx) => {
        const lead = tx.select().from(leads).where(eq(leads.id, c.id)).get();
        if (!lead) return null;
        const hasFuture =
          tx
            .select({ id: followUps.id })
            .from(followUps)
            .where(
              and(
                eq(followUps.leadId, lead.id),
                eq(followUps.status, 'PENDING'),
                gt(followUps.dueAt, now),
              ),
            )
            .get() !== undefined;
        const decision = shouldAutoCold(lead, hasFuture, now, cfg);
        if (!decision.cold) return null;
        transition(tx, lead.id, { to: 'COLD', changedBy: null, reason: decision.reason, now });
        const row = {
          id: ulid(),
          leadId: lead.id,
          actorId: null,
          kind: 'SYSTEM' as const,
          type: 'AUTO_COLD' as const,
          outcome: null,
          note: `Auto-moved to Cold: ${decision.reason}`,
          aiAssisted: false,
          metadata: { from: lead.stage, to: 'COLD', reason: decision.reason },
          createdAt: now,
        };
        tx.insert(activities).values(row).run();
        writeAudit(tx, {
          actorId: null,
          action: 'lead.auto_cold',
          entity: 'lead',
          entityId: lead.id,
          before: { stage: lead.stage },
          after: { stage: 'COLD' },
          meta: { reason: decision.reason },
        });
        return { lead, row };
      });
      if (!out) continue;
      cold++;
      const base = { at: now, teamId: out.lead.teamId, ownerId: out.lead.ownerId, by: null };
      try {
        await publish({
          ...base,
          type: 'activity.created',
          leadId: out.lead.id,
          activity: {
            id: out.row.id,
            leadId: out.lead.id,
            actorId: null,
            actorName: null,
            kind: 'SYSTEM',
            type: 'AUTO_COLD',
            outcome: null,
            note: out.row.note,
            aiAssisted: false,
            metadata: out.row.metadata,
            createdAt: now,
          },
        });
        await publish({
          ...base,
          type: 'lead.updated',
          leadId: out.lead.id,
          changes: { stage: 'COLD' },
        });
      } catch (err) {
        console.warn('[jobs] cold-detector: publish failed:', (err as Error).message);
      }
    } catch (err) {
      failed++;
      console.warn(`[jobs] cold-detector: lead ${c.id} failed:`, (err as Error).message);
    }
  }
  return { cold, failed };
}
