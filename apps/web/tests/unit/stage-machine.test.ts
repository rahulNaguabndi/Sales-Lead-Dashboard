import { describe, expect, it } from 'vitest';
import {
  STAGES,
  STAGE_LABELS,
  StageChangeSchema,
  TRANSITIONS,
  allowedTargets,
  canTransition,
  type StageActor,
} from '@leaddesk/shared';

const ACTORS: StageActor[] = ['REP', 'MANAGER', 'VP', 'SYSTEM'];
const OPEN = ['NEW', 'CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION'];

function expected(from: string, to: string, actor: StageActor): boolean {
  if (from === to || from === 'WON') return false;
  const priv = actor === 'MANAGER' || actor === 'VP';
  if (from === 'LOST') return to === 'CONTACTED' && priv;
  if (from === 'COLD') return to === 'CONTACTED' || to === 'LOST';
  if (to === 'COLD') return priv || actor === 'SYSTEM';
  if (to === 'LOST' || to === 'WON') return to === 'LOST' || !['NEW', 'CONTACTED'].includes(from);
  if (to === 'NEW') return false;
  return OPEN.includes(to);
}

describe('stage matrix (SC-001)', () => {
  for (const from of STAGES)
    for (const to of STAGES)
      for (const actor of ACTORS) {
        it(`${from} -> ${to} as ${actor}`, () => {
          expect(canTransition(from, to, actor)).toBe(expected(from, to, actor));
        });
      }

  it('WON is terminal', () => {
    expect(TRANSITIONS.WON).toEqual([]);
    for (const a of ACTORS) expect(allowedTargets('WON', a)).toEqual([]);
  });

  it('allowedTargets matches canTransition and labels cover every stage', () => {
    expect(allowedTargets('NEW', 'REP')).toEqual(['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION', 'LOST']);
    expect(allowedTargets('LOST', 'REP')).toEqual([]);
    expect(allowedTargets('LOST', 'MANAGER')).toEqual(['CONTACTED']);
    for (const s of STAGES) expect(STAGE_LABELS[s]).toBeTruthy();
  });
});

describe('StageChangeSchema', () => {
  it('WON requires a positive capped deal value', () => {
    expect(StageChangeSchema.safeParse({ to: 'WON', version: 1 }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'WON', version: 1, dealValue: 0 }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'WON', version: 1, dealValue: 100_000_001 }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'WON', version: 1, dealValue: 3650000 }).success).toBe(true);
  });
  it('LOST requires a reason; OTHER needs a 3-500 char note', () => {
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0 }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0, lostReason: 'PRICE' }).success).toBe(true);
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0, lostReason: 'OTHER' }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0, lostReason: 'OTHER', lostNote: 'ab' }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0, lostReason: 'OTHER', lostNote: 'abc' }).success).toBe(true);
    expect(StageChangeSchema.safeParse({ to: 'LOST', version: 0, lostReason: 'OTHER', lostNote: 'x'.repeat(501) }).success).toBe(false);
  });
  it('other targets need only version', () => {
    expect(StageChangeSchema.safeParse({ to: 'QUALIFIED', version: 2 }).success).toBe(true);
    expect(StageChangeSchema.safeParse({ to: 'QUALIFIED' }).success).toBe(false);
    expect(StageChangeSchema.safeParse({ to: 'BOGUS', version: 2 }).success).toBe(false);
  });
});
