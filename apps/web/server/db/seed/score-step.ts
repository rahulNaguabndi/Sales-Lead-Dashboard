import { eq } from 'drizzle-orm';
import { scoreLead } from '@leaddesk/shared';
import type { Db, Tx } from '../client';
import { leads } from '../schema';
import { loadScoreInput } from '../../services/scoring';
import { clock } from './utils/time';

/**
 * Scores seed leads with the real engine (F09 FR-011). Closed leads are scored as of their
 * closing time so they keep the score they would have had. `forceHot` leads (demo scenarios)
 * are guaranteed to land in the HOT band: only if the rules leave them below it, the score is
 * raised to the HOT threshold, with the gap added to the breakdown's engagement factor.
 */
export function scoreLeads(
  db: Db | Tx,
  leadIds?: string[],
  forceHot: Set<string> = new Set(),
): void {
  const rows = db.select().from(leads).all();
  const wanted = leadIds ? new Set(leadIds) : null;

  for (const lead of rows) {
    if (wanted && !wanted.has(lead.id)) continue;
    const at = lead.closedAt ?? clock.now;
    const result = scoreLead(loadScoreInput(db, lead.id), at);
    let { score, priority } = result;
    const breakdown = { ...result.breakdown };
    if (forceHot.has(lead.id) && priority !== 'HOT') {
      breakdown.engagement += 70 - score;
      score = 70;
      priority = 'HOT';
    }
    db.update(leads)
      .set({ score, priority, scoreBreakdown: breakdown })
      .where(eq(leads.id, lead.id))
      .run();
  }
}
