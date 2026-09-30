import { describe, expect, it } from 'vitest';
import { createActivitySchema } from '@leaddesk/shared';

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0);
const schema = createActivitySchema(() => NOW);
const ID = '01J9ZC0000000000000000ABCD';
const base = { clientRequestId: ID, type: 'CALL', outcome: 'CONNECTED', note: 'Called customer' };
const fields = (r: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('CreateActivitySchema', () => {
  it('accepts a valid call', () => {
    const r = schema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.aiAssisted).toBe(false);
  });

  it('trims the note and enforces 1-2000 chars', () => {
    const ok = schema.parse({ ...base, note: '  hi  ' });
    expect(ok.note).toBe('hi');
    expect(schema.safeParse({ ...base, note: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...base, note: 'x'.repeat(2000) }).success).toBe(true);
    expect(schema.safeParse({ ...base, note: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('strips control chars except newline and tab, keeps emoji', () => {
    const r = schema.parse({ ...base, note: 'a\u0000b\u0007c\nd\te \u{1F697}' });
    expect(r.note).toBe('abc\nd\te \u{1F697}');
    expect(schema.safeParse({ ...base, note: '\u0000\u0001' }).success).toBe(false);
  });

  it.each(['CALL', 'WHATSAPP', 'SMS', 'EMAIL'])('requires an outcome for %s', (type) => {
    const r = schema.safeParse({ ...base, type, outcome: undefined });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('outcome');
  });

  it.each(['MEETING', 'TEST_DRIVE'])('outcome is optional for %s', (type) => {
    expect(schema.safeParse({ ...base, type, outcome: undefined }).success).toBe(true);
    expect(schema.safeParse({ ...base, type, outcome: 'INTERESTED' }).success).toBe(true);
  });

  it('forbids an outcome on NOTE', () => {
    const r = schema.safeParse({ ...base, type: 'NOTE' });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('outcome');
    expect(schema.safeParse({ ...base, type: 'NOTE', outcome: undefined }).success).toBe(true);
  });

  it('bounds the follow-up due time to now+1min .. now+90d', () => {
    const at = (ms: number) => ({ nextFollowUp: { dueAt: new Date(NOW + ms).toISOString() } });
    expect(schema.safeParse({ ...base, ...at(-1000) }).success).toBe(false);
    expect(schema.safeParse({ ...base, ...at(30_000) }).success).toBe(false);
    expect(schema.safeParse({ ...base, ...at(60_000) }).success).toBe(true);
    expect(schema.safeParse({ ...base, ...at(90 * 86_400_000) }).success).toBe(true);
    expect(schema.safeParse({ ...base, ...at(90 * 86_400_000 + 1) }).success).toBe(false);
  });

  it('limits the follow-up note to 200 chars', () => {
    const dueAt = new Date(NOW + 3_600_000).toISOString();
    expect(
      schema.safeParse({ ...base, nextFollowUp: { dueAt, note: 'x'.repeat(200) } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...base, nextFollowUp: { dueAt, note: 'x'.repeat(201) } }).success,
    ).toBe(false);
  });

  it('accepts only open stages for stageChange', () => {
    for (const to of ['QUALIFIED', 'CONTACTED', 'NEGOTIATION']) {
      expect(schema.safeParse({ ...base, stageChange: { to } }).success).toBe(true);
    }
    for (const to of ['WON', 'LOST', 'COLD']) {
      expect(schema.safeParse({ ...base, stageChange: { to } }).success).toBe(false);
    }
  });

  it('requires a ULID clientRequestId', () => {
    expect(schema.safeParse({ ...base, clientRequestId: 'nope' }).success).toBe(false);
    expect(schema.safeParse({ ...base, clientRequestId: ID.slice(0, 25) + 'U' }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...base, clientRequestId: undefined }).success).toBe(false);
  });
});
