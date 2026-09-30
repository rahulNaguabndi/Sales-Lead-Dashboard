import { describe, expect, it } from 'vitest';
import { ROLES, STAGES } from './enums';
import type { Role, Stage } from './enums';
import { TRANSITIONS, autoAdvance, canTransition, isContactActivity } from './stage-machine';

type Actor = Role | 'SYSTEM';

describe('canTransition', () => {
  it('allows every transition in the TRANSITIONS table for a manager (or system for COLD)', () => {
    for (const from of STAGES) {
      for (const to of TRANSITIONS[from]) {
        const ok = (['MANAGER', 'VP', 'SYSTEM'] as Actor[]).some((a) => canTransition(from, to, a));
        expect(ok, `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it('rejects every transition not in the table', () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        if (TRANSITIONS[from].includes(to)) continue;
        for (const actor of [...ROLES, 'SYSTEM'] as Actor[]) {
          expect(canTransition(from, to, actor), `${from} -> ${to} by ${actor}`).toBe(false);
        }
      }
    }
  });

  it('lets reps make ordinary open-stage moves, including backwards', () => {
    expect(canTransition('NEW', 'CONTACTED', 'REP')).toBe(true);
    expect(canTransition('NEGOTIATION', 'QUALIFIED', 'REP')).toBe(true);
    expect(canTransition('NEGOTIATION', 'WON', 'REP')).toBe(true);
    expect(canTransition('QUALIFIED', 'LOST', 'REP')).toBe(true);
  });

  it('restricts COLD to SYSTEM, MANAGER and VP', () => {
    expect(canTransition('CONTACTED', 'COLD', 'REP')).toBe(false);
    expect(canTransition('CONTACTED', 'COLD', 'SYSTEM')).toBe(true);
    expect(canTransition('CONTACTED', 'COLD', 'MANAGER')).toBe(true);
    expect(canTransition('CONTACTED', 'COLD', 'VP')).toBe(true);
  });

  it('restricts reopening LOST to MANAGER and VP', () => {
    expect(canTransition('LOST', 'CONTACTED', 'REP')).toBe(false);
    expect(canTransition('LOST', 'CONTACTED', 'MANAGER')).toBe(true);
    expect(canTransition('LOST', 'CONTACTED', 'VP')).toBe(true);
  });

  it('treats WON as terminal', () => {
    for (const to of STAGES as readonly Stage[]) expect(TRANSITIONS.WON).not.toContain(to);
  });
});

describe('autoAdvance', () => {
  it('advances NEW on a contact activity only', () => {
    expect(autoAdvance('NEW', 'CALL', 'USER')).toBe('CONTACTED');
    expect(autoAdvance('NEW', 'NOTE', 'USER')).toBeNull();
  });
  it('revives COLD on a contact activity', () => {
    expect(autoAdvance('COLD', 'WHATSAPP', 'USER')).toBe('CONTACTED');
  });
  it('never advances WON', () => {
    expect(autoAdvance('WON', 'CALL', 'USER')).toBeNull();
  });
});

describe('isContactActivity', () => {
  it('is true only for USER activities that are not notes', () => {
    expect(isContactActivity('CALL', 'USER')).toBe(true);
    expect(isContactActivity('NOTE', 'USER')).toBe(false);
    expect(isContactActivity('LEAD_CREATED', 'SYSTEM')).toBe(false);
  });
});
