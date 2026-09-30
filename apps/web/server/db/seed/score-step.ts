import { eq } from 'drizzle-orm';
import type { LeadSource, Priority } from '@leaddesk/shared';
import type { Db, Tx } from '../client';
import { customers, leads } from '../schema';
import { clock, DAY } from './utils/time';

/**
 * STUB scoring for seed data (FR-039). F09 replaces this function body with the real scoring
 * engine's scoreLead(); the signature and call site stay the same.
 */
const SOURCE_BASE: Record<LeadSource, number> = {
  WALK_IN: 60,
  REFERRAL: 60,
  PHONE: 55,
  WEBSITE: 50,
  GOOGLE_ADS: 45,
  PORTAL: 40,
  FACEBOOK: 35,
  INSTAGRAM: 35,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function scoreLeads(db: Db | Tx, leadIds?: string[], forceHot: Set<string> = new Set()): void {
  const rows = db
    .select({ lead: leads, isReturning: customers.isReturning })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .all();
  const wanted = leadIds ? new Set(leadIds) : null;
  const now = clock.now;

  for (const { lead, isReturning } of rows) {
    if (wanted && !wanted.has(lead.id)) continue;
    const base = SOURCE_BASE[lead.source];
    const open = !['WON', 'LOST', 'COLD'].includes(lead.stage);
    const recent = now - lead.createdAt < 14 * DAY;
    const intentBonus =
      (lead.testDriveRequested ? 8 : 0) + (lead.wantsFinance ? 5 : 0) + (lead.hasTradeIn ? 5 : 0) + (lead.vehicleModel ? 3 : 0);
    const raw = base + intentBonus + (isReturning ? 6 : 0);

    let score: number;
    if (forceHot.has(lead.id)) score = 88;
    else if (lead.stage === 'WON') score = clamp(70 + (raw % 25), 70, 95);
    else if (open && recent) score = clamp(raw - 5, 40, 69);
    else score = clamp(raw - 30, 20, 39);

    const priority: Priority = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COOL';
    const sourcePts = Math.round(base * 0.3);
    const customerPts = isReturning ? 10 : 5;
    const freshnessPts = recent ? 15 : 5;
    db.update(leads)
      .set({
        score,
        priority,
        scoreBreakdown: {
          intent: Math.max(0, score - sourcePts - customerPts - freshnessPts),
          source: sourcePts,
          customer: customerPts,
          freshness: freshnessPts,
          engagement: 0,
        },
      })
      .where(eq(leads.id, lead.id))
      .run();
  }
}
