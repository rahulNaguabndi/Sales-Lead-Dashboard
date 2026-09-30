import { describe, expect, it } from 'vitest';
import { ruleDraft, ruleSuggest } from '@/server/services/ai/rules';
import { act, makeCtx, MIN, NOW } from './fixture';

const nba = (over: Parameters<typeof makeCtx>[0]) => ruleSuggest(makeCtx(over)).nextBestAction;
const offer = { id: 'o1', title: 'Winter bonus', description: '', reasons: [] };

describe('ruleSuggest order', () => {
  it('1 closed -> WAIT', () => {
    const a = nba({ stage: 'WON' });
    expect(a.action).toBe('WAIT');
    expect(a.reason).toBe('Lead closed');
  });
  it('2 NEW without contact -> preferred channel now', () => {
    expect(nba({ stage: 'NEW' })).toMatchObject({ action: 'WHATSAPP', channel: 'WHATSAPP', timing: 'Now' });
  });
  it('3 HOT untouched > 30 min -> escalate', () => {
    const a = nba({ priority: 'HOT', activities: [act('CALL', 'CONNECTED', NOW - 45 * MIN)] });
    expect(a.action).toBe('ESCALATE_TO_MANAGER');
  });
  it('4 two attempts, last NO_ANSWER -> secondary channel at best time', () => {
    const a = nba({
      preferredChannel: 'CALL',
      secondaryChannel: 'EMAIL',
      activities: [act('CALL', 'NO_ANSWER', NOW - 600 * MIN), act('CALL', 'NO_ANSWER', NOW - 10 * MIN)],
    });
    expect(a.channel).toBe('EMAIL');
    expect(a.timing).toBe('This evening (after 18:00)');
  });
  it('4b primary CALL without secondary -> WhatsApp', () => {
    const a = nba({
      preferredChannel: 'CALL',
      secondaryChannel: null,
      activities: [act('CALL', 'NO_ANSWER', NOW - 600 * MIN), act('CALL', 'NO_ANSWER', NOW - 10 * MIN)],
    });
    expect(a.channel).toBe('WHATSAPP');
  });
  it('5 test drive requested -> schedule', () => {
    expect(nba({ testDriveRequested: true, offers: [offer] }).action).toBe('SCHEDULE_TEST_DRIVE');
  });
  it('6 eligible offer -> SEND_OFFER on preferred channel', () => {
    expect(nba({ offers: [offer] })).toMatchObject({ action: 'SEND_OFFER', channel: 'WHATSAPP', offerId: 'o1' });
  });
  it('7 COLD -> revival', () => {
    expect(nba({ stage: 'COLD' }).reason).toMatch(/cold/);
  });
  it('8 default', () => {
    expect(nba({}).action).toBe('WHATSAPP');
  });
  it('summary stays within 600 chars', () => {
    expect(ruleSuggest(makeCtx()).summary.length).toBeLessThanOrEqual(600);
  });
});

describe('ruleDraft', () => {
  it.each(['en', 'de', 'fr', 'it', 'es', 'nl', 'pt'])('supports %s on all channels', (language) => {
    for (const channel of ['WHATSAPP', 'SMS', 'EMAIL'] as const) {
      const r = ruleDraft(makeCtx({ language }), channel);
      expect(r.draft.language).toBe(language);
      expect(r.draft.body.length).toBeGreaterThan(0);
      expect(r.draft.body.length).toBeLessThanOrEqual(channel === 'EMAIL' ? 1000 : 600);
      if (channel === 'EMAIL') expect(r.draft.subject).toEqual(expect.any(String));
      else expect(r.draft.subject).toBeNull();
      expect(r.templateLanguage).toBeUndefined();
    }
  });
  it('unsupported language falls back to English', () => {
    const r = ruleDraft(makeCtx({ language: 'pl' }), 'SMS');
    expect(r.draft.language).toBe('en');
    expect(r.templateLanguage).toBe('en');
  });
});
