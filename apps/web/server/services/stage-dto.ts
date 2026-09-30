import type { leads } from '../db/schema';

type LeadRow = typeof leads.$inferSelect;

/** Wire shape of a lead after a stage change. */
export function toLeadDTO(l: LeadRow) {
  return {
    id: l.id,
    stage: l.stage,
    version: l.version,
    dealValue: l.dealValue,
    lostReason: l.lostReason,
    closedAt: l.closedAt,
    score: l.score,
    priority: l.priority,
    attemptCount: l.attemptCount,
  };
}
