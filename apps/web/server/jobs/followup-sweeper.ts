import { and, eq, gte, lt } from 'drizzle-orm';
import {
  DUE_SOON_MINUTES,
  ruleConfigFromEnv,
  type FollowUpRuleConfig,
  type LeadDeskEvent,
} from '@leaddesk/shared';
import { db, withTx } from '../db/client';
import { followUps, leads } from '../db/schema';
import { bus } from '../events/bus';
import { getRedis, redisStatus } from '../redis/client';
import { addFollowUpActivity, announce } from '../services/followup';

const NOTIFIED_TTL_S = 3600;
const notified = new Map<string, number>();

/** True the first time a follow-up is announced (Redis SET NX EX, in-memory fallback). */
async function markNotified(id: string, now: number): Promise<boolean> {
  if (redisStatus() === 'connected') {
    try {
      const ok = await getRedis().set(`fu:notified:${id}`, '1', 'EX', NOTIFIED_TTL_S, 'NX');
      return ok === 'OK';
    } catch {
      /* fall through to memory */
    }
  }
  for (const [k, exp] of notified) if (exp <= now) notified.delete(k);
  if (notified.has(id)) return false;
  notified.set(id, now + NOTIFIED_TTL_S * 1000);
  return true;
}

export function resetSweeperForTests(): void {
  notified.clear();
}

export type SweeperOpts = {
  now?: number;
  cfg?: FollowUpRuleConfig;
  publish?: (e: LeadDeskEvent) => Promise<void> | void;
};

/** FR-005: PENDING > 24 h overdue -> MISSED; follow-ups due within 5 min -> one `followup.due`. */
export async function runFollowUpSweeper(
  o: SweeperOpts = {},
): Promise<{ missed: number; dueSoon: number }> {
  const now = o.now ?? Date.now();
  const cfg = o.cfg ?? ruleConfigFromEnv();
  const publish = o.publish ?? ((e: LeadDeskEvent) => bus.publish(e));

  const stale = db
    .select({ f: followUps, teamId: leads.teamId, ownerId: leads.ownerId })
    .from(followUps)
    .innerJoin(leads, eq(leads.id, followUps.leadId))
    .where(
      and(
        eq(followUps.status, 'PENDING'),
        lt(followUps.dueAt, now - cfg.missedAfterHours * 3_600_000),
      ),
    )
    .all();

  let missed = 0;
  for (const s of stale) {
    try {
      const row = withTx((tx) => {
        const res = tx
          .update(followUps)
          .set({ status: 'MISSED' })
          .where(and(eq(followUps.id, s.f.id), eq(followUps.status, 'PENDING')))
          .run();
        if (res.changes === 0) return null;
        return addFollowUpActivity(tx, {
          leadId: s.f.leadId,
          type: 'FOLLOW_UP_MISSED',
          action: 'missed',
          note: 'Follow-up missed',
          now,
          metadata: { followUpId: s.f.id, dueAt: s.f.dueAt },
        });
      });
      if (row) {
        missed++;
        await announce(
          { id: s.f.leadId, teamId: s.teamId, ownerId: s.ownerId },
          null,
          [row],
          { publish },
          null,
        );
      }
    } catch (err) {
      console.warn('[jobs] followup-sweeper: failed to mark missed:', (err as Error).message);
    }
  }

  const soon = db
    .select({ f: followUps, teamId: leads.teamId })
    .from(followUps)
    .innerJoin(leads, eq(leads.id, followUps.leadId))
    .where(
      and(
        eq(followUps.status, 'PENDING'),
        gte(followUps.dueAt, now),
        lt(followUps.dueAt, now + DUE_SOON_MINUTES * 60_000),
      ),
    )
    .all();

  let dueSoon = 0;
  for (const s of soon) {
    if (!(await markNotified(s.f.id, now))) continue;
    dueSoon++;
    try {
      await publish({
        type: 'followup.due',
        at: now,
        teamId: s.teamId,
        ownerId: s.f.assignedTo,
        by: null,
        followUpId: s.f.id,
        leadId: s.f.leadId,
        dueAt: s.f.dueAt,
      });
    } catch (err) {
      console.warn('[jobs] followup-sweeper: publish failed:', (err as Error).message);
    }
  }
  return { missed, dueSoon };
}
