import { describe, expect, it, vi } from 'vitest';
import {
  explainScore,
  isScoreFrozen,
  priorityForScore,
  scoreLead,
  slaStatus,
  type ScoreInput,
} from './scoring';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const MSG45 = 'x'.repeat(45);

const base: ScoreInput = {
  testDriveRequested: false,
  wantsFinance: false,
  hasTradeIn: false,
  budgetMin: null,
  budgetMax: null,
  vehicleModel: null,
  message: null,
  source: 'WEBSITE',
  isReturning: false,
  lastPurchaseAt: null,
  createdAt: NOW,
  lastPositiveOutcome: null,
  unansweredAttempts: 0,
};
const mk = (o: Partial<ScoreInput>): ScoreInput => ({ ...base, ...o });
const A = mk({
  testDriveRequested: true,
  wantsFinance: true,
  hasTradeIn: true,
  budgetMax: 40000,
  vehicleModel: 'aurora-suv',
  message: MSG45,
  createdAt: NOW - 5 * MIN,
});

describe('scoreLead worked examples', () => {
  const cases: [string, ScoreInput, number[], number, string][] = [
    ['A', A, [35, 10, 0, 20, 0], 65, 'WARM'],
    [
      'A-returning',
      mk({ ...A, isReturning: true, lastPurchaseAt: NOW - 7 * YEAR }),
      [35, 10, 10, 20, 0],
      75,
      'HOT',
    ],
    [
      'B',
      mk({
        source: 'INSTAGRAM',
        vehicleModel: 'm',
        message: 'x'.repeat(10),
        createdAt: NOW - 2 * DAY,
        unansweredAttempts: 2,
      }),
      [4, 5, 0, 10, 0],
      19,
      'COOL',
    ],
    [
      'C',
      mk({
        source: 'REFERRAL',
        isReturning: true,
        lastPurchaseAt: NOW - 3 * YEAR,
        testDriveRequested: true,
        wantsFinance: true,
        budgetMin: 1,
        vehicleModel: 'm',
        createdAt: NOW - 20 * HOUR,
        lastPositiveOutcome: 'INTERESTED',
      }),
      [26, 15, 15, 15, 15],
      86,
      'HOT',
    ],
    [
      'D',
      mk({
        source: 'WALK_IN',
        testDriveRequested: true,
        hasTradeIn: true,
        vehicleModel: 'm',
        message: 'x'.repeat(50),
        createdAt: NOW - 4 * DAY,
        lastPositiveOutcome: 'CALLBACK_REQUESTED',
        unansweredAttempts: 1,
      }),
      [25, 14, 0, 5, 7],
      51,
      'WARM',
    ],
    [
      'E',
      mk({
        source: 'GOOGLE_ADS',
        wantsFinance: true,
        budgetMax: 1,
        createdAt: NOW - 8 * DAY,
        unansweredAttempts: 3,
      }),
      [10, 8, 0, 0, 0],
      18,
      'COOL',
    ],
    [
      'F',
      mk({
        source: 'PHONE',
        testDriveRequested: true,
        vehicleModel: 'm',
        createdAt: NOW - 30 * MIN,
        lastPositiveOutcome: 'CONNECTED',
      }),
      [16, 12, 0, 20, 6],
      54,
      'WARM',
    ],
  ];
  it.each(cases)('%s', (_n, input, parts, score, band) => {
    const r = scoreLead(input, NOW);
    expect(Object.values(r.breakdown)).toEqual(parts);
    expect(r.score).toBe(score);
    expect(r.priority).toBe(band);
  });
});

describe('scoreLead rules', () => {
  it('maps boundaries 70/40/39', () => {
    expect(priorityForScore(70)).toBe('HOT');
    expect(priorityForScore(40)).toBe('WARM');
    expect(priorityForScore(39)).toBe('COOL');
  });
  it('stays within 0-100', () => {
    const top = scoreLead(
      mk({
        ...A,
        source: 'REFERRAL',
        isReturning: true,
        lastPurchaseAt: NOW - YEAR,
        lastPositiveOutcome: 'INTERESTED',
      }),
      NOW,
    );
    expect(top.score).toBeLessThanOrEqual(100);
    expect(
      scoreLead(mk({ createdAt: 0, unansweredAttempts: 9 }), NOW).score,
    ).toBeGreaterThanOrEqual(0);
  });
  it('treats a future createdAt as fully fresh', () => {
    expect(scoreLead(mk({ createdAt: NOW + DAY }), NOW).breakdown.freshness).toBe(20);
  });
  it('does not give budget points for 0', () => {
    expect(scoreLead(mk({ budgetMin: 0, budgetMax: 0 }), NOW).breakdown.intent).toBe(0);
  });
  it('counts message length by code points on the trimmed text', () => {
    const ws = mk({ message: '   ' + 'x'.repeat(30) + '   ' });
    expect(scoreLead(ws, NOW).breakdown.intent).toBe(0);
    expect(scoreLead(mk({ message: '\u{1F600}'.repeat(31) }), NOW).breakdown.intent).toBe(4);
  });
  it('scores an unknown source 0 and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(scoreLead(mk({ source: 'TELEPATHY' as never }), NOW).breakdown.source).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('gives NOT_INTERESTED no points and floors engagement at 0', () => {
    expect(scoreLead(mk({ lastPositiveOutcome: 'NOT_INTERESTED' }), NOW).breakdown.engagement).toBe(
      0,
    );
    expect(scoreLead(mk({ unansweredAttempts: 5 }), NOW).breakdown.engagement).toBe(0);
  });
  it('applies the 5-year purchase window', () => {
    const r7 = scoreLead(mk({ isReturning: true, lastPurchaseAt: NOW - 7 * YEAR }), NOW);
    const r3 = scoreLead(mk({ isReturning: true, lastPurchaseAt: NOW - 3 * YEAR }), NOW);
    expect(r7.breakdown.customer).toBe(10);
    expect(r3.breakdown.customer).toBe(15);
  });
  it('is deterministic and fast (1,000 calls < 50 ms)', () => {
    const t = performance.now();
    for (let i = 0; i < 1000; i++) scoreLead(A, NOW);
    expect(performance.now() - t).toBeLessThan(50);
    expect(scoreLead(A, NOW)).toEqual(scoreLead(A, NOW));
  });
});

describe('reasons', () => {
  it('produces plain-language labels with points', () => {
    const r = explainScore(
      mk({ testDriveRequested: true, unansweredAttempts: 2, createdAt: NOW - 5 * MIN }),
      NOW,
    );
    expect(r.reasons).toContainEqual({
      factor: 'intent',
      label: 'Test drive requested',
      points: 12,
    });
    expect(r.reasons).toContainEqual({
      factor: 'engagement',
      label: '2 unanswered attempts',
      points: -6,
    });
    expect(r.reasons).toContainEqual({ factor: 'source', label: 'Source: website', points: 10 });
  });
});

describe('slaStatus', () => {
  const lead = (o: object) => ({
    stage: 'NEW' as const,
    priority: 'HOT' as const,
    createdAt: NOW,
    hasContact: false,
    ...o,
  });
  it('HOT NEW 16 min is BREACHED', () => {
    expect(slaStatus(lead({}), NOW + 16 * MIN)).toEqual({
      status: 'BREACHED',
      deadline: NOW + 15 * MIN,
    });
  });
  it('HOT NEW 12 min is DUE_SOON', () => {
    expect(slaStatus(lead({}), NOW + 12 * MIN).status).toBe('DUE_SOON');
  });
  it('HOT NEW 11 min is OK', () => {
    expect(slaStatus(lead({}), NOW + 11 * MIN).status).toBe('OK');
  });
  it('WARM NEW 100 min is DUE_SOON', () => {
    expect(slaStatus(lead({ priority: 'WARM' }), NOW + 100 * MIN).status).toBe('DUE_SOON');
  });
  it('WARM NEW 30 min is OK', () => {
    expect(slaStatus(lead({ priority: 'WARM' }), NOW + 30 * MIN).status).toBe('OK');
  });
  it('contacted or not NEW is NA', () => {
    expect(slaStatus(lead({ hasContact: true }), NOW + DAY).status).toBe('NA');
    expect(slaStatus(lead({ stage: 'CONTACTED' }), NOW + DAY).status).toBe('NA');
  });
});

describe('isScoreFrozen', () => {
  it('freezes WON/LOST only', () => {
    expect(isScoreFrozen('WON')).toBe(true);
    expect(isScoreFrozen('LOST')).toBe(true);
    expect(isScoreFrozen('COLD')).toBe(false);
  });
});
