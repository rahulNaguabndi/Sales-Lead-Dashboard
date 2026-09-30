import { and, desc, eq, gte, max, notInArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  isScoreFrozen,
  scoreLead,
  type Outcome,
  type Priority,
  type ScoreInput,
  type ScoreResult,
} from '@leaddesk/shared';
import { db, withTx, type Tx } from '../db/client';
import { writeAudit } from '../db/audit';
import { activities, customers, leads, purchases } from '../db/schema';

const RECENT_ACTIVITY_LIMIT = 20;
const FRESHNESS_WINDOW_MS = 8 * 24 * 3_600_000;
const BATCH_SIZE = 200;
const DECISIVE: readonly Outcome[] = [
  'INTERESTED',
  'CALLBACK_REQUESTED',
  'CONNECTED',
  'NOT_INTERESTED',
];
const UNANSWERED: readonly Outcome[] = ['NO_ANSWER', 'VOICEMAIL'];

/** Reads a lead's scoring inputs. Engagement comes from the latest USER activities only. */
export function loadScoreInput(tx: Tx | typeof db, leadId: string): ScoreInput {
  const row = tx
    .select({ lead: leads, isReturning: customers.isReturning })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(eq(leads.id, leadId))
    .get();
  if (!row) throw new Error(`scoring: lead ${leadId} not found`);
  const { lead } = row;

  const purchase = tx
    .select({ at: max(purchases.purchasedAt) })
    .from(purchases)
    .where(eq(purchases.customerId, lead.customerId))
    .get();

  const recent = tx
    .select({ outcome: activities.outcome })
    .from(activities)
    .where(and(eq(activities.leadId, leadId), eq(activities.kind, 'USER')))
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(RECENT_ACTIVITY_LIMIT)
    .all();

  // Walk newest → oldest: unanswered attempts count until the latest decisive outcome.
  let lastPositiveOutcome: Outcome | null = null;
  let unansweredAttempts = 0;
  for (const { outcome } of recent) {
    if (!outcome) continue;
    if (DECISIVE.includes(outcome)) {
      lastPositiveOutcome = outcome;
      break;
    }
    if (UNANSWERED.includes(outcome)) unansweredAttempts++;
  }

  return {
    testDriveRequested: lead.testDriveRequested,
    wantsFinance: lead.wantsFinance,
    hasTradeIn: lead.hasTradeIn,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    vehicleModel: lead.vehicleModel,
    message: lead.message,
    source: lead.source,
    isReturning: row.isReturning,
    lastPurchaseAt: purchase?.at ?? null,
    createdAt: lead.createdAt,
    lastPositiveOutcome,
    unansweredAttempts,
  };
}

export interface RecomputeOutcome {
  changed: boolean;
  priorityChanged: boolean;
  before: Priority;
  result: ScoreResult;
}

/**
 * Recomputes and stores one lead's score (FR-007…FR-010). Writes only on change, never bumps
 * `version`, and adds a SCORE_CHANGED timeline entry only when the priority band changes.
 * WON/LOST leads are frozen. Callers must publish `lead.updated { changes: { score, priority } }`
 * after their transaction commits when `changed` is true.
 */
export function recomputeLeadScore(tx: Tx, leadId: string, now: number): RecomputeOutcome {
  const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new Error(`scoring: lead ${leadId} not found`);
  const result = scoreLead(loadScoreInput(tx, leadId), now);
  const before = lead.priority;
  if (isScoreFrozen(lead.stage)) {
    return { changed: false, priorityChanged: false, before, result };
  }

  const b = lead.scoreBreakdown;
  const same =
    lead.score === result.score &&
    before === result.priority &&
    (Object.keys(result.breakdown) as (keyof typeof b)[]).every(
      (k) => b?.[k] === result.breakdown[k],
    );
  if (same) return { changed: false, priorityChanged: false, before, result };

  const priorityChanged = before !== result.priority;
  tx.update(leads)
    .set({ score: result.score, priority: result.priority, scoreBreakdown: result.breakdown })
    .where(eq(leads.id, leadId))
    .run();

  if (priorityChanged) {
    tx.insert(activities)
      .values({
        id: ulid(),
        leadId,
        actorId: null,
        kind: 'SYSTEM',
        type: 'SCORE_CHANGED',
        outcome: null,
        note: `Priority ${before} → ${result.priority} (score ${result.score})`,
        aiAssisted: false,
        metadata: { from: before, to: result.priority, score: result.score },
        createdAt: now,
      })
      .run();
  }
  writeAudit(tx, {
    actorId: null,
    action: 'lead.score',
    entity: 'lead',
    entityId: leadId,
    before: { score: lead.score, priority: before },
    after: { score: result.score, priority: result.priority },
  });
  return { changed: true, priorityChanged, before, result };
}

/**
 * Re-scores open leads younger than 8 days so freshness decays (FR-008). One transaction per
 * batch of 200. Returns ids whose priority band changed, so the scheduler can publish events.
 */
export function recomputeFreshScores(now: number): { priorityChangedIds: string[] } {
  const ids = db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        notInArray(leads.stage, ['WON', 'LOST']),
        gte(leads.createdAt, now - FRESHNESS_WINDOW_MS),
      ),
    )
    .all()
    .map((r) => r.id);

  const priorityChangedIds: string[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    withTx((tx) => {
      for (const id of batch) {
        if (recomputeLeadScore(tx, id, now).priorityChanged) priorityChangedIds.push(id);
      }
    });
  }
  return { priorityChangedIds };
}
