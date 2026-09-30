import { describe, expect, it } from 'vitest';
import { LEAD_SOURCES, OUTCOMES, scoreLead, type ScoreInput } from '@leaddesk/shared';

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);

function* snapshots(): Generator<ScoreInput> {
  for (const source of LEAD_SOURCES) {
    for (const outcome of [null, ...OUTCOMES]) {
      for (const unanswered of [0, 1, 5, 100]) {
        for (const createdAt of [NOW + 10_000, NOW, NOW - 3_600_000, NOW - 400 * 86_400_000]) {
          yield {
            testDriveRequested: unanswered % 2 === 0,
            wantsFinance: unanswered > 0,
            hasTradeIn: createdAt % 2 === 0,
            budgetMin: unanswered === 1 ? null : 10_000,
            budgetMax: unanswered === 5 ? null : 50_000,
            vehicleModel: unanswered === 0 ? null : 'Model X',
            message: unanswered === 100 ? null : 'x'.repeat(unanswered),
            source,
            isReturning: outcome === null,
            lastPurchaseAt: unanswered === 1 ? NOW - 86_400_000 : null,
            createdAt,
            lastPositiveOutcome: outcome,
            unansweredAttempts: unanswered,
          };
        }
      }
    }
  }
}

describe('scoreLead totality', () => {
  it('never throws and always returns a bounded score for any valid snapshot', () => {
    let n = 0;
    for (const input of snapshots()) {
      const r = scoreLead(input, NOW);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(['HOT', 'WARM', 'COOL']).toContain(r.priority);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });
});
