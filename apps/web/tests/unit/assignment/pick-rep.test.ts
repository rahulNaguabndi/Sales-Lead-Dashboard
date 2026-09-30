import { describe, expect, it } from 'vitest';
import { pickRep, type PickableRep } from '@/server/services/assignment.pick-rep';

const rep = (id: string, over: Partial<PickableRep> = {}): PickableRep => ({
  id,
  name: id,
  languages: ['de'],
  openCount: 0,
  lastAssignedAt: null,
  maxOpenLeads: 25,
  isActive: true,
  ...over,
});
const opts = { language: 'de', rrCursor: null as string | null };

describe('pickRep', () => {
  it('LOAD_BALANCED: fewest open, tie → oldest last_assigned, tie → name', () => {
    const reps = [
      rep('c', { openCount: 2 }),
      rep('b', { openCount: 1, lastAssignedAt: 50 }),
      rep('a', { openCount: 1, lastAssignedAt: 10 }),
    ];
    expect(pickRep('LOAD_BALANCED', reps, opts)?.candidate.id).toBe('a');
    expect(pickRep('LOAD_BALANCED', [rep('z'), rep('y')], opts)?.candidate.id).toBe('y');
  });

  it('LANGUAGE_MATCH: prefers speakers, then load; falls back to everyone', () => {
    const reps = [rep('a', { languages: ['it'] }), rep('b', { languages: ['de'], openCount: 9 })];
    expect(pickRep('LANGUAGE_MATCH', reps, opts)?.candidate.id).toBe('b');
    const fb = pickRep('LANGUAGE_MATCH', reps, { ...opts, language: 'fr' });
    expect(fb?.candidate.id).toBe('a');
    expect(fb?.reason).toContain('fallback');
  });

  it('ROUND_ROBIN: next after cursor by name, wraps, survives a missing cursor', () => {
    const reps = [rep('a'), rep('b'), rep('c')];
    expect(pickRep('ROUND_ROBIN', reps, opts)?.candidate.id).toBe('a');
    expect(pickRep('ROUND_ROBIN', reps, { ...opts, rrCursor: 'a' })?.candidate.id).toBe('b');
    expect(pickRep('ROUND_ROBIN', reps, { ...opts, rrCursor: 'c' })?.candidate.id).toBe('a');
    expect(pickRep('ROUND_ROBIN', reps, { ...opts, rrCursor: 'gone' })?.candidate.id).toBe('a');
  });

  it('skips inactive reps and reps at their limit; null when nobody is eligible', () => {
    const reps = [
      rep('a', { isActive: false }),
      rep('b', { openCount: 5, maxOpenLeads: 5 }),
      rep('c', { openCount: 4, maxOpenLeads: 5 }),
    ];
    expect(pickRep('LOAD_BALANCED', reps, opts)?.candidate.id).toBe('c');
    expect(pickRep('LOAD_BALANCED', reps.slice(0, 2), opts)).toBeNull();
    expect(pickRep('ROUND_ROBIN', [], opts)).toBeNull();
  });

  it('reason mentions strategy details (FR-010)', () => {
    const r = pickRep('LANGUAGE_MATCH', [rep('a', { openCount: 11 })], opts);
    expect(r?.reason).toBe('language match: de · 11 open leads');
  });

  it('SC-003: 40 leads into 4 equal reps end within ±1', () => {
    const reps = ['a', 'b', 'c', 'd'].map((id) => rep(id));
    let t = 1;
    for (let i = 0; i < 40; i++) {
      const p = pickRep('LOAD_BALANCED', reps, opts)!;
      const r = reps.find((x) => x.id === p.candidate.id)!;
      r.openCount += 1;
      r.lastAssignedAt = t++;
    }
    const counts = reps.map((r) => r.openCount);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
