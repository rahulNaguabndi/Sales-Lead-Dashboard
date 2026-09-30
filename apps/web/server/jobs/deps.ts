import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Stage } from '@leaddesk/shared';
import { withTx } from '../db/client';
import { leads, stageHistory } from '../db/schema';
import { recomputeFreshScores } from '../services/scoring';

export type TransitionInput = { to: Stage; changedBy: string | null; reason: string; now: number };

/**
 * Stage transition used by the cold-detector. Uses F07's `stageService.transition` when that
 * module exists; until F07 merges it falls back to a minimal equivalent (history row + stage).
 * The caller owns the surrounding transaction so the AUTO_COLD activity stays atomic with it.
 */
export async function loadStageTransition(): Promise<
  (tx: Parameters<Parameters<typeof withTx>[0]>[0], leadId: string, i: TransitionInput) => void
> {
  try {
    const modPath = '../services/stage';
    const mod = (await import(/* @vite-ignore */ modPath)) as {
      stageService?: { transitionInTx?: (...a: unknown[]) => void };
    };
    const fn = mod.stageService?.transitionInTx;
    if (fn) return (tx, id, i) => fn(tx, id, { to: i.to, changedBy: i.changedBy, reason: i.reason });
  } catch {
    /* F07 not merged yet */
  }
  return (tx, leadId, i) => {
    const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
    if (!lead) return;
    tx.insert(stageHistory)
      .values({
        id: ulid(),
        leadId,
        fromStage: lead.stage,
        toStage: i.to,
        changedBy: i.changedBy,
        reason: i.reason,
        changedAt: i.now,
      })
      .run();
    tx.update(leads)
      .set({ stage: i.to, updatedAt: i.now, version: lead.version + 1 })
      .where(eq(leads.id, leadId))
      .run();
  };
}

export function freshScores(now: number): { priorityChangedIds: string[] } {
  return recomputeFreshScores(now);
}
