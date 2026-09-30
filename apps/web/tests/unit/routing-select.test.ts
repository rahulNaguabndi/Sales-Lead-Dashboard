import { describe, expect, it } from 'vitest';
import {
  eligibleReps,
  selectLanguageMatch,
  selectLoadBalanced,
  selectRoundRobin,
  type Candidate,
} from '@/server/services/routing';

const c = (
  id: string,
  openCount: number,
  lastAssignedAt: number | null,
  languages = ['de'],
): Candidate => ({ id, name: id, languages, openCount, lastAssignedAt });

describe('selectLoadBalanced', () => {
  it('picks the fewest open leads', () => {
    const pick = selectLoadBalanced([
      c('anna', 12, 1),
      c('jonas', 9, 5),
      c('lea', 9, 3),
      c('felix', 14, 1),
    ]);
    expect(pick.id).toBe('lea'); // tie with jonas → oldest last_assigned_at
  });
  it('treats never-assigned as oldest, then name, then id', () => {
    expect(selectLoadBalanced([c('b', 1, 5), c('a', 1, null)]).id).toBe('a');
    expect(selectLoadBalanced([c('b', 1, null), c('a', 1, null)]).id).toBe('a');
    expect(
      selectLoadBalanced([
        { ...c('x', 1, 1), id: '2' },
        { ...c('x', 1, 1), id: '1' },
      ]).id,
    ).toBe('1');
  });
});

describe('selectLanguageMatch', () => {
  const reps = [
    c('anna', 5, 1, ['de', 'en']),
    c('lea', 9, 1, ['de', 'fr']),
    c('felix', 2, 1, ['de']),
  ];
  it('filters by language then balances', () => {
    const r = selectLanguageMatch(reps, 'fr');
    expect(r.candidate.id).toBe('lea');
    expect(r.reason).toBe('language match: fr');
  });
  it('falls back to load balancing with a reason', () => {
    const r = selectLanguageMatch(reps, 'it');
    expect(r.candidate.id).toBe('felix');
    expect(r.reason).toBe('language fallback: no it speaker');
  });
});

describe('selectRoundRobin', () => {
  const reps = [c('c', 0, null), c('a', 0, null), c('b', 0, null)];
  it('starts at the first by name and advances after the cursor', () => {
    expect(selectRoundRobin(reps, null).id).toBe('a');
    expect(selectRoundRobin(reps, 'a').id).toBe('b');
    expect(selectRoundRobin(reps, 'b').id).toBe('c');
  });
  it('wraps around and copes with an unknown cursor', () => {
    expect(selectRoundRobin(reps, 'c').id).toBe('a');
    expect(selectRoundRobin(reps, 'gone').id).toBe('a');
  });
});

describe('eligibleReps', () => {
  it('keeps active same-team reps under capacity', () => {
    const row = (id: string, o: Partial<Parameters<typeof eligibleReps>[0][number]> = {}) => ({
      id,
      name: id,
      role: 'REP',
      isActive: true,
      teamId: 't',
      maxOpenLeads: 2,
      openCount: 0,
      ...o,
    });
    const rows = [
      row('1', { openCount: 1 }),
      row('2', { isActive: false }),
      row('3', { role: 'MANAGER' }),
      row('4', { openCount: 2 }),
      row('5', { teamId: 'x' }),
    ];
    expect(eligibleReps(rows, 't').map((r) => r.id)).toEqual(['1']);
  });
});
