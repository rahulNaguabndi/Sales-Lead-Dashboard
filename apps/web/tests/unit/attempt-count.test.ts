import { describe, expect, it } from 'vitest';
import { nextAttemptCount } from '@/server/services/activity';

describe('nextAttemptCount', () => {
  it.each(['CALL', 'WHATSAPP', 'SMS', 'EMAIL'] as const)('%s unanswered increments', (t) => {
    expect(nextAttemptCount(1, t, 'NO_ANSWER')).toBe(2);
    expect(nextAttemptCount(0, t, 'VOICEMAIL')).toBe(1);
  });

  it.each(['CONNECTED', 'INTERESTED', 'NOT_INTERESTED', 'CALLBACK_REQUESTED'] as const)(
    '%s resets to 0',
    (o) => {
      expect(nextAttemptCount(3, 'CALL', o)).toBe(0);
    },
  );

  it('MEETING and TEST_DRIVE reset regardless of outcome', () => {
    expect(nextAttemptCount(2, 'MEETING', null)).toBe(0);
    expect(nextAttemptCount(2, 'TEST_DRIVE', 'NO_ANSWER')).toBe(0);
  });

  it('NOTE leaves the count unchanged', () => {
    expect(nextAttemptCount(2, 'NOTE', null)).toBe(2);
    expect(nextAttemptCount(0, 'NOTE', null)).toBe(0);
  });

  it('a contact type without an outcome leaves it unchanged', () => {
    expect(nextAttemptCount(2, 'CALL', null)).toBe(2);
  });
});
