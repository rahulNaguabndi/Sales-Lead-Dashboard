import { describe, expect, it } from 'vitest';
import { scrubPII } from '@/server/services/ai/context';

describe('scrubPII', () => {
  it('redacts emails', () => {
    expect(scrubPII('mail me at giulia.rossi@example.com please')).toBe('mail me at [redacted] please');
  });
  it.each(['+49 151 2345 6789', '+33 6 12 34 56 78', '+39 333 1234567'])('redacts phone %s', (p) => {
    expect(scrubPII(`call ${p} today`)).toBe('call [redacted] today');
  });
  it('redacts IBANs', () => {
    const out = scrubPII('pay DE89 3704 0044 0532 0130 00 now');
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('3704');
  });
  it('redacts known strings case-insensitively', () => {
    expect(scrubPII('Mr Rossi called', ['rossi'])).toBe('Mr [redacted] called');
  });
  it('keeps ordinary text', () => {
    expect(scrubPII('Wants the E3 in blue, budget 30k')).toBe('Wants the E3 in blue, budget 30k');
  });
});
