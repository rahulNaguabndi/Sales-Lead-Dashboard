import { describe, expect, it } from 'vitest';
import {
  deriveAgeBand,
  nonMobileChannelWarning,
  normalizeEmail,
  normalizePhone,
} from '@/server/services/dedupe';

describe('normalizePhone', () => {
  it.each([
    ['0151 1234 5678', 'DE', '+4915112345678'],
    ['+49 151 1234 5678', 'DE', '+4915112345678'],
    ['0049 151 1234 5678', 'DE', '+4915112345678'],
    ['347 123 4567', 'IT', '+393471234567'],
    ['0033 6 12 34 56 78', 'FR', '+33612345678'],
    ['06 12 34 56 78', 'FR', '+33612345678'],
  ])('%s (%s) -> %s', (raw, country, expected) => {
    expect(normalizePhone(raw, country as 'DE')).toBe(expected);
  });

  it('returns null for an invalid number', () => {
    expect(normalizePhone('12', 'DE')).toBeNull();
    expect(normalizePhone('000 000', 'FR')).toBeNull();
  });
});

describe('normalizeEmail / deriveAgeBand', () => {
  it('trims and lowercases', () =>
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com'));
  it.each([
    [18, '18-25'],
    [25, '18-25'],
    [26, '26-35'],
    [35, '26-35'],
    [36, '36-45'],
    [45, '36-45'],
    [46, '46-60'],
    [60, '46-60'],
    [61, '60+'],
    [null, 'UNKNOWN'],
  ])('age %s -> %s', (age, band) => expect(deriveAgeBand(age)).toBe(band));
});

describe('nonMobileChannelWarning', () => {
  it('warns for WhatsApp on a landline, not for mobile or call', () => {
    expect(nonMobileChannelWarning('+493012345678', 'WHATSAPP')).toBe(true);
    expect(nonMobileChannelWarning('+4915112345678', 'WHATSAPP')).toBe(false);
    expect(nonMobileChannelWarning('+493012345678', 'CALL')).toBe(false);
    expect(nonMobileChannelWarning(null, 'SMS')).toBe(false);
  });
});
