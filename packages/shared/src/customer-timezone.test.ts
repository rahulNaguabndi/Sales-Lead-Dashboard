import { describe, expect, it } from 'vitest';
import { bestTimeHint, timezoneForCountry } from './customer-timezone';

describe('timezoneForCountry', () => {
  it('maps countries and falls back to Berlin', () => {
    expect(timezoneForCountry('IT')).toBe('Europe/Rome');
    expect(timezoneForCountry('PT')).toBe('Europe/Lisbon');
    expect(timezoneForCountry('DE')).toBe('Europe/Berlin');
    expect(timezoneForCountry('XX')).toBe('Europe/Berlin');
  });
});

describe('bestTimeHint', () => {
  // 2026-06-15 08:15Z = 10:15 in Milan (CEST)
  const morningUtc = Date.UTC(2026, 5, 15, 8, 15);
  it('hints when outside the preferred window', () => {
    expect(bestTimeHint('EVENING', 'IT', 'Milan', morningUtc)).toBe(
      "Customer prefers evenings (it's 10:15 in Milan)",
    );
  });
  it('gives no hint inside the window or for ANYTIME', () => {
    expect(bestTimeHint('MORNING', 'IT', 'Milan', morningUtc)).toBeNull();
    expect(bestTimeHint('ANYTIME', 'IT', 'Milan', morningUtc)).toBeNull();
  });
  it('handles the DST edge (winter = UTC+1)', () => {
    const winter = Date.UTC(2026, 0, 15, 16, 30); // 17:30 in Rome
    expect(bestTimeHint('AFTERNOON', 'IT', 'Milan', winter)).toBe(
      "Customer prefers afternoons (it's 17:30 in Milan)",
    );
    expect(bestTimeHint('EVENING', 'IT', 'Milan', winter)).toBeNull();
  });
});
