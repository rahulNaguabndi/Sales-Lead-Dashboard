import { describe, expect, it } from 'vitest';
import {
  bucketKey,
  computeDelta,
  dayKey,
  resolvePeriod,
  safeDiv,
  zeroFillBuckets,
  zonedDayStart,
  STAGE_AGING_TARGETS,
} from '@/server/services/dashboard-metrics';

const HOUR = 3_600_000;
// 2026-09-30 10:00 UTC = 12:00 Brussels (CEST)
const NOW = Date.UTC(2026, 8, 30, 10, 0, 0);

describe('dayKey / zonedDayStart (Europe/Brussels)', () => {
  it('buckets 23:30 UTC into the next Brussels day in winter', () => {
    expect(dayKey(Date.UTC(2026, 0, 15, 23, 30))).toBe('2026-01-16');
    expect(dayKey(Date.UTC(2026, 0, 15, 22, 59))).toBe('2026-01-15');
  });
  it('uses the summer offset in July', () => {
    expect(dayKey(Date.UTC(2026, 6, 15, 22, 30))).toBe('2026-07-16');
    expect(dayKey(Date.UTC(2026, 6, 15, 21, 59))).toBe('2026-07-15');
  });
  it('zonedDayStart returns local midnight', () => {
    expect(zonedDayStart('2026-01-16')).toBe(Date.UTC(2026, 0, 15, 23, 0));
    expect(zonedDayStart('2026-07-16')).toBe(Date.UTC(2026, 6, 15, 22, 0));
  });
  it('handles the 23 h and 25 h DST days', () => {
    expect(zonedDayStart('2026-03-30') - zonedDayStart('2026-03-29')).toBe(23 * HOUR);
    expect(zonedDayStart('2026-10-26') - zonedDayStart('2026-10-25')).toBe(25 * HOUR);
  });
});

describe('resolvePeriod', () => {
  it('30d covers 30 local days ending today, prev is the 30 before', () => {
    const p = resolvePeriod({ range: '30d' }, NOW);
    expect(p.fromDate).toBe('2026-09-01');
    expect(p.toDate).toBe('2026-09-30');
    expect(p.from).toBe(zonedDayStart('2026-09-01'));
    expect(p.to).toBe(zonedDayStart('2026-10-01') - 1);
    expect(p.prevTo).toBe(p.from - 1);
    expect(p.prevFrom).toBe(zonedDayStart('2026-08-02'));
  });
  it('7d and 90d', () => {
    expect(resolvePeriod({ range: '7d' }, NOW).fromDate).toBe('2026-09-24');
    expect(resolvePeriod({ range: '90d' }, NOW).fromDate).toBe('2026-07-03');
  });
  it('today', () => {
    const p = resolvePeriod({ range: 'today' }, NOW);
    expect(p.fromDate).toBe('2026-09-30');
    expect(p.prevFrom).toBe(zonedDayStart('2026-09-29'));
  });
  it('mtd starts on the first of the month', () => {
    const p = resolvePeriod({ range: 'mtd' }, NOW);
    expect(p.fromDate).toBe('2026-09-01');
    expect(p.toDate).toBe('2026-09-30');
  });
  it('custom range with an equal-length previous period', () => {
    const p = resolvePeriod({ range: 'custom', from: '2026-09-10', to: '2026-09-14' }, NOW);
    expect(p.from).toBe(zonedDayStart('2026-09-10'));
    expect(p.to).toBe(zonedDayStart('2026-09-15') - 1);
    expect(p.prevFrom).toBe(zonedDayStart('2026-09-05'));
    expect(p.prevTo).toBe(p.from - 1);
  });
  it('rejects from > to and ranges over 366 days', () => {
    expect(() =>
      resolvePeriod({ range: 'custom', from: '2026-09-14', to: '2026-09-10' }, NOW),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RANGE', statusCode: 400 }));
    expect(() =>
      resolvePeriod({ range: 'custom', from: '2025-01-01', to: '2026-09-10' }, NOW),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
    expect(() =>
      resolvePeriod({ range: 'custom', from: '2025-09-10', to: '2026-09-10' }, NOW),
    ).not.toThrow();
  });
  it('rejects an impossible calendar date', () => {
    expect(() =>
      resolvePeriod({ range: 'custom', from: '2026-02-31', to: '2026-03-02' }, NOW),
    ).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
  });
});

describe('computeDelta', () => {
  it('higher is better', () => {
    expect(computeDelta(110, 100)).toEqual({ abs: 10, pct: 10, direction: 'up', good: true });
    expect(computeDelta(90, 100)).toEqual({ abs: -10, pct: -10, direction: 'down', good: false });
  });
  it('lower is better inverts good/bad', () => {
    expect(computeDelta(30, 42, true)).toMatchObject({ abs: -12, direction: 'down', good: true });
    expect(computeDelta(50, 42, true)).toMatchObject({ direction: 'up', good: false });
  });
  it('null prev → new, zero prev with value → new', () => {
    expect(computeDelta(5, null)).toEqual({ abs: null, pct: null, direction: 'new', good: null });
    expect(computeDelta(5, 0)).toMatchObject({ direction: 'new' });
  });
  it('null value → none; equal → flat', () => {
    expect(computeDelta(null, 5)).toEqual({ abs: null, pct: null, direction: 'none', good: null });
    expect(computeDelta(5, 5)).toEqual({ abs: 0, pct: 0, direction: 'flat', good: null });
    expect(computeDelta(0, 0)).toMatchObject({ direction: 'flat' });
  });
});

describe('safeDiv', () => {
  it('returns null on a zero denominator', () => {
    expect(safeDiv(5, 0)).toBeNull();
    expect(safeDiv(1, 4)).toBe(0.25);
  });
});

describe('bucketing', () => {
  it('zero-fills days', () => {
    const from = zonedDayStart('2026-09-01');
    const to = zonedDayStart('2026-09-05') - 1;
    const rows = zeroFillBuckets(from, to, new Map([['2026-09-02', 3]]));
    expect(rows.bucket).toBe('day');
    expect(rows.keys).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
    expect(rows.values).toEqual([0, 3, 0, 0]);
  });
  it('switches to ISO-week (Monday) buckets when span > 60 days', () => {
    const from = zonedDayStart('2026-07-01');
    const to = zonedDayStart('2026-09-30') - 1;
    const rows = zeroFillBuckets(from, to, new Map());
    expect(rows.bucket).toBe('week');
    expect(rows.keys[0]).toBe('2026-06-29'); // the Monday on/before Jul 1
    expect(rows.keys.every((k) => new Date(`${k}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(bucketKey(Date.UTC(2026, 6, 1, 10), 'week')).toBe('2026-06-29');
    expect(bucketKey(Date.UTC(2026, 6, 1, 10), 'day')).toBe('2026-07-01');
  });
});

describe('STAGE_AGING_TARGETS', () => {
  it('is 3 days for NEW/CONTACTED and 7 for others', () => {
    expect(STAGE_AGING_TARGETS.NEW).toBe(3);
    expect(STAGE_AGING_TARGETS.CONTACTED).toBe(3);
    expect(STAGE_AGING_TARGETS.QUALIFIED).toBe(7);
    expect(STAGE_AGING_TARGETS.TEST_DRIVE).toBe(7);
    expect(STAGE_AGING_TARGETS.NEGOTIATION).toBe(7);
  });
});
