import { describe, expect, it } from 'vitest';
import { LeadListQuerySchema } from '@leaddesk/shared';
import {
  compareRank,
  defaultView,
  endOfDay,
  isSlaBreach,
  normalizeListParams,
  searchTerms,
  zonedDayStart,
  type InboxCaps,
  type RankFields,
} from '../lead-query.rank';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 30, 10, 0, 0);

const r = (id: string, o: Partial<RankFields> = {}): RankFields & { id: string } => ({
  id,
  overdue: false,
  slaBreach: false,
  score: 50,
  createdAt: NOW - DAY,
  ...o,
});

describe('compareRank (FR-003, SC-004)', () => {
  it('orders overdue > SLA breach > score > newest > id', () => {
    const fixture = [
      r('plain-82', { score: 82 }),
      r('plain-55', { score: 55 }),
      r('sla', { slaBreach: true, score: 30 }),
      r('overdue-low', { overdue: true, score: 10 }),
      r('tie-old', { score: 55, createdAt: NOW - 3 * DAY }),
      r('tie-new-b', { score: 55, createdAt: NOW - 1000 }),
      r('tie-new-a', { score: 55, createdAt: NOW - 1000 }),
      r('overdue-sla', { overdue: true, slaBreach: true, score: 5 }),
    ];
    const sorted = [...fixture].sort(compareRank).map((x) => x.id);
    expect(sorted).toEqual([
      'overdue-sla',
      'overdue-low',
      'sla',
      'plain-82',
      'tie-new-b',
      'tie-new-a',
      'plain-55',
      'tie-old',
    ]);
  });

  it('is stable regardless of input order', () => {
    const a = [r('a', { score: 70 }), r('b', { score: 70 }), r('c', { overdue: true })];
    expect([...a].reverse().sort(compareRank)).toEqual([...a].sort(compareRank));
  });
});

describe('isSlaBreach (FR-004)', () => {
  const base = { stage: 'NEW' as const, priority: 'HOT' as const, hasContact: false };
  it('HOT boundary at 15 minutes', () => {
    expect(isSlaBreach({ ...base, createdAt: NOW - (14 * MIN + 59_000) }, NOW)).toBe(false);
    expect(isSlaBreach({ ...base, createdAt: NOW - (15 * MIN + 1000) }, NOW)).toBe(true);
  });
  it('WARM/COOL boundary at 2 hours', () => {
    const warm = { ...base, priority: 'WARM' as const };
    expect(isSlaBreach({ ...warm, createdAt: NOW - (HOUR + 59 * MIN) }, NOW)).toBe(false);
    expect(isSlaBreach({ ...warm, createdAt: NOW - (2 * HOUR + MIN) }, NOW)).toBe(true);
    expect(isSlaBreach({ ...warm, priority: 'COOL', createdAt: NOW - 3 * HOUR }, NOW)).toBe(true);
  });
  it('never breaches once contacted or past NEW', () => {
    expect(isSlaBreach({ ...base, hasContact: true, createdAt: NOW - DAY }, NOW)).toBe(false);
    expect(isSlaBreach({ ...base, stage: 'CONTACTED', createdAt: NOW - DAY }, NOW)).toBe(false);
  });
});

describe('time zones', () => {
  it('endOfDay is the next local midnight (Europe/Berlin, CEST)', () => {
    expect(endOfDay(NOW, 'Europe/Berlin')).toBe(Date.UTC(2026, 8, 30, 22, 0, 0));
  });
  it('respects another zone', () => {
    expect(endOfDay(NOW, 'America/New_York')).toBe(Date.UTC(2026, 9, 1, 4, 0, 0));
  });
  it('falls back to Europe/Berlin for an invalid tz', () => {
    expect(endOfDay(NOW, 'Not/AZone')).toBe(endOfDay(NOW, 'Europe/Berlin'));
  });
  it('handles the DST change day (Berlin 2026-10-25 has 25 hours)', () => {
    const before = Date.UTC(2026, 9, 24, 23, 0, 0); // 01:00 local on the 25th
    expect(endOfDay(before, 'Europe/Berlin')).toBe(Date.UTC(2026, 9, 25, 23, 0, 0));
  });
  it('zonedDayStart gives local midnight for a calendar date', () => {
    expect(zonedDayStart('2026-09-30', 'Europe/Berlin')).toBe(Date.UTC(2026, 8, 29, 22, 0, 0));
  });
});

const REP: InboxCaps = { leader: false, orgWide: false };
const MANAGER: InboxCaps = { leader: true, orgWide: false };
const VP: InboxCaps = { leader: true, orgWide: true };

describe('normalizeListParams', () => {
  const parse = (o: Record<string, string>) => LeadListQuerySchema.parse(o);

  it('defaults the view by role', () => {
    expect(defaultView(REP)).toBe('mine');
    expect(defaultView(MANAGER)).toBe('team');
    expect(defaultView(VP)).toBe('team');
    expect(normalizeListParams(parse({}), REP).view).toBe('mine');
    expect(normalizeListParams(parse({}), VP).view).toBe('team');
  });

  it('maps role-inappropriate views to something safe', () => {
    expect(normalizeListParams(parse({ view: 'team' }), REP).view).toBe('mine');
    expect(normalizeListParams(parse({ view: 'all' }), REP).view).toBe('mine');
    expect(normalizeListParams(parse({ view: 'all' }), MANAGER).view).toBe('team');
    expect(normalizeListParams(parse({ view: 'all' }), VP).view).toBe('team');
    expect(normalizeListParams(parse({ view: 'going_cold' }), REP).view).toBe('going_cold');
  });

  it('drops owner for REP and team for non-VP', () => {
    const q = parse({ owner: 'u1,unassigned', team: 't1' });
    const rep = normalizeListParams(q, REP);
    expect(rep.owners).toBeNull();
    expect(rep.teams).toBeNull();
    const mgr = normalizeListParams(q, MANAGER);
    expect(mgr.owners).toEqual(['u1', 'unassigned']);
    expect(mgr.teams).toBeNull();
    expect(normalizeListParams(q, VP).teams).toEqual(['t1']);
  });

  it('expands sourceGroup and merges with source (AND)', () => {
    const n = normalizeListParams(parse({ sourceGroup: 'SOCIAL' }), VP);
    expect([...(n.sources ?? [])].sort()).toEqual(['FACEBOOK', 'INSTAGRAM']);
    const both = normalizeListParams(
      parse({ sourceGroup: 'SOCIAL', source: 'FACEBOOK,WEBSITE' }),
      VP,
    );
    expect(both.sources).toEqual(['FACEBOOK']);
  });

  it('resolves stages: explicit > closed toggle > open only', () => {
    expect(normalizeListParams(parse({}), REP).stages).toEqual([
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'TEST_DRIVE',
      'NEGOTIATION',
    ]);
    expect(normalizeListParams(parse({ closed: 'true' }), REP).stages).toContain('WON');
    expect(normalizeListParams(parse({ closed: 'true' }), REP).stages).not.toContain('COLD');
    expect(normalizeListParams(parse({ stage: 'COLD' }), REP).stages).toEqual(['COLD']);
  });

  it('uses the default tz for invalid values and keeps valid ones', () => {
    expect(normalizeListParams(parse({ tz: 'nope' }), REP).tz).toBe('Europe/Berlin');
    expect(normalizeListParams(parse({ tz: 'Asia/Tokyo' }), REP).tz).toBe('Asia/Tokyo');
  });

  it('schema rejects bad values and accepts CSV', () => {
    expect(LeadListQuerySchema.safeParse({ stage: 'NOPE' }).success).toBe(false);
    expect(LeadListQuerySchema.safeParse({ pageSize: '30' }).success).toBe(false);
    expect(LeadListQuerySchema.safeParse({ createdFrom: 'yesterday' }).success).toBe(false);
    expect(parse({ stage: 'NEW,QUALIFIED' }).stage).toEqual(['NEW', 'QUALIFIED']);
  });
});

describe('searchTerms (FR-007)', () => {
  it('ignores queries under 2 characters', () => {
    expect(searchTerms('a')).toBeNull();
    expect(searchTerms('  ')).toBeNull();
    expect(searchTerms(undefined)).toBeNull();
  });
  it('is case- and accent-insensitive', () => {
    expect(searchTerms('ÉMILE')?.text).toBe('emile');
    expect(searchTerms('Conti')?.text).toBe('conti');
  });
  it('turns phone-like input into digits and requires 4+ of them', () => {
    expect(searchTerms('+39 333 1234')?.text).toBe('393331234');
    expect(searchTerms('12')?.text).toBeNull();
    expect(searchTerms('123')?.text).toBeNull();
    expect(searchTerms('1234')?.text).toBe('1234');
  });
  it('keeps the raw reference prefix', () => {
    expect(searchTerms('EDM-2026-008')?.reference).toBe('EDM-2026-008');
  });
  it('escapes LIKE wildcards', () => {
    expect(searchTerms('50%_off')?.text).toBe('50\\%\\_off');
  });
});
