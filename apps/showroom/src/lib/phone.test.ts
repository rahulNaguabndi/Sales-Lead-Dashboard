import { describe, expect, it } from 'vitest';
import { combinePhone, dialForCountry } from './phone';

describe('combinePhone', () => {
  it('joins dial code and digits', () => {
    expect(combinePhone('+49', '151 1234 5678')).toBe('+4915112345678');
  });
  it('strips a duplicated dial prefix', () => {
    expect(combinePhone('+49', '+49 151 1234 5678')).toBe('+4915112345678');
    expect(combinePhone('+49', '0049 151 1234 5678')).toBe('+4915112345678');
  });
  it('returns undefined for empty digits', () => {
    expect(combinePhone('+49', '  ')).toBeUndefined();
    expect(combinePhone('+49', '')).toBeUndefined();
  });
  it('dial follows the country', () => {
    expect(dialForCountry('FR')).toBe('+33');
    expect(combinePhone(dialForCountry('AT'), '660 123456')).toBe('+43660123456');
  });
});
