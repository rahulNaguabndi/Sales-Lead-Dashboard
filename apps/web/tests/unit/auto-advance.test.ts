import { describe, expect, it } from 'vitest';
import { STAGES, USER_ACTIVITY_TYPES, autoAdvance } from '@leaddesk/shared';
import { isAllowedOpenTransition } from '@/server/services/activity';

describe('autoAdvance', () => {
  for (const stage of STAGES) {
    for (const type of USER_ACTIVITY_TYPES) {
      const expected =
        type !== 'NOTE' && (stage === 'NEW' || stage === 'COLD') ? 'CONTACTED' : null;
      it(`${stage} + ${type} -> ${expected}`, () => {
        expect(autoAdvance(stage, type, 'USER')).toBe(expected);
      });
    }
  }
  it('system activities never advance', () => {
    expect(autoAdvance('NEW', 'STAGE_CHANGED', 'SYSTEM')).toBeNull();
  });
});

describe('isAllowedOpenTransition', () => {
  it('allows forward one step and backward moves', () => {
    expect(isAllowedOpenTransition('CONTACTED', 'QUALIFIED', 'REP')).toBe(true);
    expect(isAllowedOpenTransition('NEGOTIATION', 'CONTACTED', 'REP')).toBe(true);
  });
  it('rejects targets the state machine forbids', () => {
    expect(isAllowedOpenTransition('NEW', 'NEW', 'REP')).toBe(false);
    expect(isAllowedOpenTransition('QUALIFIED', 'NEW', 'REP')).toBe(false);
  });
  it('rejects closed targets and closed sources', () => {
    expect(isAllowedOpenTransition('CONTACTED', 'WON', 'REP')).toBe(false);
    expect(isAllowedOpenTransition('CONTACTED', 'LOST', 'MANAGER')).toBe(false);
    expect(isAllowedOpenTransition('CONTACTED', 'COLD', 'VP')).toBe(false);
    expect(isAllowedOpenTransition('WON', 'CONTACTED', 'VP')).toBe(false);
    expect(isAllowedOpenTransition('LOST', 'CONTACTED', 'VP')).toBe(false);
  });
});
