import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatEUR } from './format';
import {
  endOfDayBrussels,
  formatOfferValue,
  isOfferActive,
  matchOffers,
  OfferEligibilitySchema,
  OfferInputSchema,
  offerStatus,
  startOfDayBrussels,
  type MatchableOffer,
  type OfferLeadContext,
} from './offer-eligibility';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

function offer(over: Partial<MatchableOffer> = {}): MatchableOffer {
  return {
    id: 'o1',
    title: 'Offer',
    description: 'desc',
    discountType: 'AMOUNT',
    value: 100_000,
    validFrom: NOW - 10 * DAY,
    validTo: NOW + 30 * DAY,
    eligibility: {},
    isActive: true,
    ...over,
  };
}

function lead(over: Partial<OfferLeadContext> = {}): OfferLeadContext {
  return {
    isReturning: false,
    country: 'DE',
    model: 'luma-ev',
    hasTradeIn: false,
    wantsFinance: false,
    budget: 4_000_000,
    source: 'WEBSITE',
    ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('OfferEligibilitySchema', () => {
  it('accepts valid rule sets', () => {
    const ok = [
      {},
      { customerType: 'RETURNING' },
      { customerType: 'NEW' },
      { customerType: 'ANY' },
      { models: ['luma-ev'], countries: ['DE', 'AT'] },
      { requiresTradeIn: true, requiresFinance: true, minBudget: 1, sources: ['WEBSITE'] },
    ];
    for (const e of ok) expect(OfferEligibilitySchema.safeParse(e).success).toBe(true);
  });

  it('rejects invalid rule sets', () => {
    const bad: unknown[] = [
      { models: [] },
      { countries: [] },
      { sources: [] },
      { countries: ['DEU'] },
      { countries: ['de'] },
      { sources: ['CARRIER_PIGEON'] },
      { unknownKey: 1 },
      { customerType: 'VIP' },
      { models: 'luma-ev' },
      { requiresTradeIn: false },
      { requiresFinance: 'yes' },
      { minBudget: 0 },
      { minBudget: -5 },
      { minBudget: 1.5 },
      { minBudget: '100' },
      null,
    ];
    for (const e of bad) expect(OfferEligibilitySchema.safeParse(e).success, String(e)).toBe(false);
  });
});

describe('OfferInputSchema', () => {
  const base = {
    title: 'Autumn Finance',
    description: 'Great',
    discountType: 'AMOUNT' as const,
    value: 50_000,
    validFrom: NOW,
    validTo: NOW + DAY,
    eligibility: {},
  };
  const parse = (o: Record<string, unknown>) => OfferInputSchema.safeParse({ ...base, ...o });

  it('accepts a valid input and applies defaults', () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(true);
    const minimal = OfferInputSchema.safeParse({
      title: 'Abc',
      discountType: 'GIFT',
      validFrom: 1,
      validTo: 1,
    });
    expect(minimal.success).toBe(true);
    if (minimal.success) {
      expect(minimal.data.description).toBe('');
      expect(minimal.data.eligibility).toEqual({});
    }
  });

  it('validates title and description bounds', () => {
    expect(parse({ title: 'ab' }).success).toBe(false);
    expect(parse({ title: 'abc' }).success).toBe(true);
    expect(parse({ title: 'a'.repeat(80) }).success).toBe(true);
    expect(parse({ title: 'a'.repeat(81) }).success).toBe(false);
    expect(parse({ description: 'a'.repeat(300) }).success).toBe(true);
    expect(parse({ description: 'a'.repeat(301) }).success).toBe(false);
  });

  it('requires value unless GIFT', () => {
    expect(parse({ value: null }).success).toBe(false);
    expect(parse({ value: undefined }).success).toBe(false);
    expect(parse({ discountType: 'GIFT', value: null }).success).toBe(true);
    expect(parse({ discountType: 'GIFT', value: undefined }).success).toBe(true);
  });

  it('bounds values per discount type', () => {
    expect(parse({ value: 0 }).success).toBe(false);
    expect(parse({ value: 1 }).success).toBe(true);
    expect(parse({ value: 1.5 }).success).toBe(false);
    expect(parse({ discountType: 'PERCENT', value: 100 }).success).toBe(true);
    expect(parse({ discountType: 'PERCENT', value: 101 }).success).toBe(false);
    expect(parse({ discountType: 'PERCENT', value: 0 }).success).toBe(false);
    expect(parse({ discountType: 'APR', value: 0 }).success).toBe(true);
    expect(parse({ discountType: 'APR', value: 2000 }).success).toBe(true);
    expect(parse({ discountType: 'APR', value: 2001 }).success).toBe(false);
    expect(parse({ discountType: 'APR', value: -1 }).success).toBe(false);
  });

  it('requires validTo >= validFrom', () => {
    expect(parse({ validFrom: NOW, validTo: NOW }).success).toBe(true);
    expect(parse({ validFrom: NOW, validTo: NOW - 1 }).success).toBe(false);
  });

  it('rejects unknown keys and bad eligibility', () => {
    expect(parse({ extra: 1 }).success).toBe(false);
    expect(parse({ eligibility: { models: [] } }).success).toBe(false);
  });
});

describe('isOfferActive / offerStatus', () => {
  it('handles inactive, scheduled, expired, active and inclusive boundaries', () => {
    const o = offer();
    expect(isOfferActive(o, NOW)).toBe(true);
    expect(offerStatus(o, NOW)).toBe('ACTIVE');
    expect(isOfferActive(offer({ isActive: false }), NOW)).toBe(false);
    expect(offerStatus(offer({ isActive: false }), NOW)).toBe('INACTIVE');
    expect(isOfferActive(offer({ validFrom: NOW + 1 }), NOW)).toBe(false);
    expect(offerStatus(offer({ validFrom: NOW + 1 }), NOW)).toBe('SCHEDULED');
    expect(isOfferActive(offer({ validTo: NOW - 1 }), NOW)).toBe(false);
    expect(offerStatus(offer({ validTo: NOW - 1 }), NOW)).toBe('EXPIRED');
    expect(isOfferActive(offer({ validFrom: NOW }), NOW)).toBe(true);
    expect(isOfferActive(offer({ validTo: NOW }), NOW)).toBe(true);
  });
});

describe('formatOfferValue', () => {
  it('formats each discount type', () => {
    expect(formatOfferValue(offer({ value: 150_000 }))).toBe(formatEUR(150_000));
    expect(formatOfferValue(offer({ value: 150_000 }))).toMatch(/^1\.500\s€$/);
    expect(formatOfferValue(offer({ discountType: 'PERCENT', value: 5 }))).toBe('5%');
    expect(formatOfferValue(offer({ discountType: 'APR', value: 90 }))).toBe('0.9% APR');
    expect(formatOfferValue(offer({ discountType: 'APR', value: 0 }))).toBe('0% APR');
    expect(
      formatOfferValue(
        offer({ discountType: 'GIFT', value: null, description: 'Free winter tyres' }),
      ),
    ).toBe('Free winter tyres');
    expect(formatOfferValue(offer({ value: null }))).toBe('');
  });
});

describe('Brussels day boundaries', () => {
  it('computes end and start of day in winter (UTC+1) and summer (UTC+2)', () => {
    expect(endOfDayBrussels('2026-12-31')).toBe(Date.UTC(2026, 11, 31, 22, 59, 59, 999));
    expect(endOfDayBrussels('2026-07-15')).toBe(Date.UTC(2026, 6, 15, 21, 59, 59, 999));
    expect(startOfDayBrussels('2026-12-31')).toBe(Date.UTC(2026, 11, 30, 23, 0, 0, 0));
    expect(startOfDayBrussels('2026-07-15')).toBe(Date.UTC(2026, 6, 14, 22, 0, 0, 0));
  });
  it('handles the DST switch days', () => {
    expect(endOfDayBrussels('2026-03-29')).toBe(Date.UTC(2026, 2, 29, 21, 59, 59, 999));
    expect(endOfDayBrussels('2026-10-25')).toBe(Date.UTC(2026, 9, 25, 22, 59, 59, 999));
  });
  it('rejects malformed dates', () => {
    expect(() => endOfDayBrussels('31/12/2026')).toThrow();
    expect(() => startOfDayBrussels('nope')).toThrow();
  });
});

describe('matchOffers', () => {
  const ids = (offers: MatchableOffer[], l = lead(), now = NOW) =>
    matchOffers(offers, l, now).map((m) => m.offer.id);

  it('matches offers with no rules and reports a generic reason', () => {
    const r = matchOffers([offer()], lead(), NOW);
    expect(r).toHaveLength(1);
    expect(r[0]!.reasons).toEqual(['Available to all customers']);
  });

  it('skips inactive, scheduled and expired offers', () => {
    const list = [
      offer({ id: 'a', isActive: false }),
      offer({ id: 'b', validFrom: NOW + DAY }),
      offer({ id: 'c', validTo: NOW - DAY }),
      offer({ id: 'd' }),
    ];
    expect(ids(list)).toEqual(['d']);
  });

  it('customerType rule', () => {
    const ret = offer({ id: 'r', eligibility: { customerType: 'RETURNING' } });
    const nw = offer({ id: 'n', eligibility: { customerType: 'NEW' } });
    const any = offer({ id: 'a', eligibility: { customerType: 'ANY' } });
    expect(ids([ret, nw, any], lead({ isReturning: true }))).toEqual(['r', 'a']);
    expect(ids([ret, nw, any], lead({ isReturning: false }))).toEqual(['n', 'a']);
    expect(matchOffers([ret], lead({ isReturning: true }), NOW)[0]!.reasons).toEqual([
      'Returning customer',
    ]);
    expect(matchOffers([nw], lead(), NOW)[0]!.reasons).toEqual(['New customer']);
  });

  it('models rule (no model fails)', () => {
    const o = offer({ eligibility: { models: ['luma-ev', 'aurora-suv'] } });
    expect(ids([o], lead({ model: 'luma-ev' }))).toEqual(['o1']);
    expect(ids([o], lead({ model: 'nova-van' }))).toEqual([]);
    expect(ids([o], lead({ model: null }))).toEqual([]);
    expect(matchOffers([o], lead(), NOW)[0]!.reasons).toEqual(['Interested in Luma EV']);
    const unknown = offer({ eligibility: { models: ['mystery'] } });
    expect(matchOffers([unknown], lead({ model: 'mystery' }), NOW)[0]!.reasons).toEqual([
      'Interested in mystery',
    ]);
  });

  it('countries rule', () => {
    const o = offer({ eligibility: { countries: ['DE', 'AT'] } });
    expect(ids([o], lead({ country: 'DE' }))).toEqual(['o1']);
    expect(ids([o], lead({ country: 'FR' }))).toEqual([]);
    expect(matchOffers([o], lead(), NOW)[0]!.reasons).toEqual(['Customer in DE']);
  });

  it('trade-in and finance rules', () => {
    const t = offer({ id: 't', eligibility: { requiresTradeIn: true } });
    const f = offer({ id: 'f', eligibility: { requiresFinance: true } });
    expect(ids([t, f], lead())).toEqual([]);
    expect(ids([t, f], lead({ hasTradeIn: true }))).toEqual(['t']);
    expect(ids([t, f], lead({ wantsFinance: true }))).toEqual(['f']);
    const both = matchOffers([t, f], lead({ hasTradeIn: true, wantsFinance: true }), NOW);
    expect(both.map((m) => m.reasons[0])).toEqual(['Has a trade-in', 'Wants finance']);
  });

  it('minBudget rule (unknown budget fails, boundary inclusive)', () => {
    const o = offer({ eligibility: { minBudget: 3_000_000 } });
    expect(ids([o], lead({ budget: 3_000_000 }))).toEqual(['o1']);
    expect(ids([o], lead({ budget: 2_999_999 }))).toEqual([]);
    expect(ids([o], lead({ budget: null }))).toEqual([]);
    expect(matchOffers([o], lead({ budget: 3_500_000 }), NOW)[0]!.reasons[0]).toMatch(
      /^Budget of at least 30\.000\s€$/,
    );
  });

  it('sources rule', () => {
    const o = offer({ eligibility: { sources: ['WEBSITE', 'PORTAL'] } });
    expect(ids([o], lead({ source: 'PORTAL' }))).toEqual(['o1']);
    expect(ids([o], lead({ source: 'PHONE' }))).toEqual([]);
    expect(matchOffers([o], lead(), NOW)[0]!.reasons).toEqual(['Source: WEBSITE']);
  });

  it('combines rules with AND', () => {
    const o = offer({
      eligibility: { customerType: 'RETURNING', requiresTradeIn: true, countries: ['DE'] },
    });
    expect(ids([o], lead({ isReturning: true, hasTradeIn: true }))).toEqual(['o1']);
    expect(ids([o], lead({ isReturning: true, hasTradeIn: false }))).toEqual([]);
    expect(ids([o], lead({ isReturning: false, hasTradeIn: true }))).toEqual([]);
    expect(ids([o], lead({ isReturning: true, hasTradeIn: true, country: 'FR' }))).toEqual([]);
    expect(
      matchOffers([o], lead({ isReturning: true, hasTradeIn: true }), NOW)[0]!.reasons,
    ).toHaveLength(3);
  });

  it('fails closed on unknown eligibility keys and warns without PII', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = offer({ id: 'bad', eligibility: { vip: true } as never });
    expect(ids([bad])).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('bad');
  });

  it('sorts by validTo asc, AMOUNT value desc, title asc', () => {
    const list = [
      offer({ id: 'late', validTo: NOW + 60 * DAY, title: 'A' }),
      offer({ id: 'small', validTo: NOW + 10 * DAY, value: 50_000, title: 'B' }),
      offer({ id: 'big', validTo: NOW + 10 * DAY, value: 150_000, title: 'C' }),
      offer({ id: 'pct', validTo: NOW + 10 * DAY, discountType: 'PERCENT', value: 5, title: 'A' }),
      offer({
        id: 'gift',
        validTo: NOW + 10 * DAY,
        discountType: 'GIFT',
        value: null,
        title: 'A0',
      }),
    ];
    expect(ids(list)).toEqual(['big', 'small', 'pct', 'gift', 'late']);
  });

  it('flags endsSoon within 7 days inclusive', () => {
    const soon = offer({ id: 'soon', validTo: NOW + 7 * DAY });
    const later = offer({ id: 'later', validTo: NOW + 7 * DAY + 1 });
    const r = matchOffers([soon, later], lead(), NOW);
    expect(r.find((m) => m.offer.id === 'soon')!.endsSoon).toBe(true);
    expect(r.find((m) => m.offer.id === 'later')!.endsSoon).toBe(false);
  });
});
