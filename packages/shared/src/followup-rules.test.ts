import { describe, expect, it } from 'vitest';
import {
  cadence,
  CreateFollowUpSchema,
  PatchFollowUpSchema,
  idleDays,
  isAtRisk,
  isMissed,
  ruleConfigFromEnv,
  shouldAutoCold,
  suggestCallbackTime,
  type RuleLead,
} from './followup-rules';

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 30, 12, 0, 0);
const lead = (o: Partial<RuleLead> = {}): RuleLead => ({
  stage: 'QUALIFIED',
  lastContactAt: now - 4 * DAY,
  createdAt: now - 30 * DAY,
  attemptCount: 0,
  ...o,
});

describe('isAtRisk', () => {
  it('flags 3+ idle days on open stages', () => {
    expect(isAtRisk(lead(), now)).toBe(true);
    expect(isAtRisk(lead({ lastContactAt: now - 2 * DAY }), now)).toBe(false);
  });
  it('NEW lead counts from createdAt', () => {
    expect(isAtRisk(lead({ stage: 'NEW', lastContactAt: null, createdAt: now - 3 * DAY }), now)).toBe(true);
    expect(isAtRisk(lead({ stage: 'NEW', lastContactAt: null, createdAt: now - DAY }), now)).toBe(false);
  });
  it('closed and cold stages are never at risk', () => {
    for (const stage of ['WON', 'LOST', 'COLD'] as const) {
      expect(isAtRisk(lead({ stage, lastContactAt: now - 20 * DAY }), now)).toBe(false);
    }
  });
  it('reports idle days', () => {
    expect(idleDays(lead(), now)).toBe(4);
  });
});

describe('shouldAutoCold', () => {
  it('7 idle days -> cold with reason', () => {
    expect(shouldAutoCold(lead({ lastContactAt: now - 8 * DAY }), false, now)).toEqual({
      cold: true,
      reason: 'No activity 7 days',
    });
  });
  it('a NOTE does not count: lastContactAt is the only reference', () => {
    // a note yesterday leaves lastContactAt untouched (8 days ago)
    expect(shouldAutoCold(lead({ lastContactAt: now - 8 * DAY }), false, now).cold).toBe(true);
  });
  it('under 7 days -> not cold', () => {
    expect(shouldAutoCold(lead({ lastContactAt: now - 6 * DAY }), false, now).cold).toBe(false);
  });
  it('future follow-up protects the 7-day rule but not the unanswered rule', () => {
    const idle = lead({ lastContactAt: now - 8 * DAY });
    expect(shouldAutoCold(idle, true, now).cold).toBe(false);
    expect(shouldAutoCold({ ...idle, attemptCount: 3 }, true, now)).toEqual({
      cold: true,
      reason: '3 unanswered attempts',
    });
  });
  it('unanswered rule wins when both apply', () => {
    expect(shouldAutoCold(lead({ lastContactAt: now - 9 * DAY, attemptCount: 4 }), false, now).reason).toBe(
      '3 unanswered attempts',
    );
  });
  it('NEW lead counts from createdAt', () => {
    const l = lead({ stage: 'NEW', lastContactAt: null, createdAt: now - 8 * DAY });
    expect(shouldAutoCold(l, false, now).cold).toBe(true);
  });
  it('closed stages are excluded', () => {
    for (const stage of ['WON', 'LOST', 'COLD'] as const) {
      expect(shouldAutoCold(lead({ stage, attemptCount: 5, lastContactAt: now - 30 * DAY }), false, now).cold).toBe(false);
    }
  });
  it('env overrides accept fractions', () => {
    const cfg = ruleConfigFromEnv({ COLD_AFTER_DAYS: '0.01', AT_RISK_DAYS: '0.005', MISSED_AFTER_HOURS: '0.5' });
    expect(cfg.coldAfterDays).toBe(0.01);
    const l = lead({ lastContactAt: now - 0.02 * DAY });
    expect(shouldAutoCold(l, false, now, cfg).cold).toBe(true);
    expect(isAtRisk(l, now, cfg)).toBe(true);
    expect(isMissed(now - 20 * 60_000, now, cfg)).toBe(false);
    expect(isMissed(now - 40 * 60_000, now, cfg)).toBe(true);
    expect(ruleConfigFromEnv({ COLD_AFTER_DAYS: 'abc' }).coldAfterDays).toBe(7);
  });
});

describe('isMissed', () => {
  it('needs more than 24 h overdue', () => {
    expect(isMissed(now - 25 * 3_600_000, now)).toBe(true);
    expect(isMissed(now - 23 * 3_600_000, now)).toBe(false);
  });
});

describe('cadence.next', () => {
  it('attempt 2 resolves PREFERRED to the customer channel', () => {
    const g = cadence.next({ priorAttempts: 1, preferredChannel: 'WHATSAPP' });
    expect(g.label).toBe('Attempt 2 of 5 · Suggested: WhatsApp today');
  });
  it('PREFERRED falls back to WhatsApp when preferred is CALL', () => {
    expect(cadence.next({ priorAttempts: 1, preferredChannel: 'CALL' }).channel).toBe('WHATSAPP');
  });
  it('step 1 is a call; step 4 is email', () => {
    expect(cadence.next({ priorAttempts: 0, preferredChannel: 'SMS' }).channel).toBe('CALL');
    expect(cadence.next({ priorAttempts: 3, preferredChannel: 'SMS' }).channel).toBe('EMAIL');
  });
  it('beyond step 5 stays on the final step and is marked done', () => {
    const g = cadence.next({ priorAttempts: 9, preferredChannel: 'SMS' });
    expect(g.attempt).toBe(5);
    expect(g.done).toBe(true);
  });
});

describe('suggestCallbackTime', () => {
  const d = new Date(2026, 8, 30, 14, 0);
  it('uses HH:MM best time next day', () => {
    const r = suggestCallbackTime(d, '17:30');
    expect([r.getDate(), r.getHours(), r.getMinutes()]).toEqual([1, 17, 30]);
  });
  it('maps named windows and defaults to 10:00', () => {
    expect(suggestCallbackTime(d, 'Evening').getHours()).toBe(18);
    expect(suggestCallbackTime(d, null).getHours()).toBe(10);
  });
});

describe('schemas', () => {
  it('rejects past and >90d due dates', () => {
    const r = CreateFollowUpSchema.safeParse({ dueAt: Date.now() - 3_600_000 });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain('Pick a future time');
    expect(CreateFollowUpSchema.safeParse({ dueAt: Date.now() + 91 * DAY }).success).toBe(false);
    expect(CreateFollowUpSchema.safeParse({ dueAt: Date.now() + DAY }).success).toBe(true);
  });
  it('allows 60 s of clock skew', () => {
    expect(CreateFollowUpSchema.safeParse({ dueAt: Date.now() - 30_000 }).success).toBe(true);
  });
  it('patch is discriminated on action', () => {
    expect(PatchFollowUpSchema.safeParse({ action: 'complete' }).success).toBe(true);
    expect(PatchFollowUpSchema.safeParse({ action: 'snooze' }).success).toBe(false);
    expect(PatchFollowUpSchema.safeParse({ action: 'cancel', note: 'x' }).success).toBe(true);
    expect(PatchFollowUpSchema.safeParse({ action: 'nope' }).success).toBe(false);
  });
});
