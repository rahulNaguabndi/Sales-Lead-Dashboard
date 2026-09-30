import { describe, expect, it } from 'vitest';
import { buildCustomerSearchText, formatEUR } from './format';

describe('buildCustomerSearchText', () => {
  it('lowercases, strips diacritics and keeps only phone digits', () => {
    const s = buildCustomerSearchText({
      firstName: 'Émile',
      lastName: 'Dubois',
      email: 'emile@test.com',
      phone: '+33612345678',
    });
    expect(s).toContain('emile');
    expect(s).toContain('dubois');
    expect(s).toContain('emile@test.com');
    expect(s).toContain('33612345678');
    expect(s).not.toContain('+');
    expect(s).not.toMatch(/\p{M}/u);
  });

  it('strips accents from names', () => {
    const s = buildCustomerSearchText({ firstName: 'María', lastName: 'García' });
    expect(s.startsWith('maria garcia')).toBe(true);
  });
});

describe('formatEUR', () => {
  it('formats euro cents with de-DE grouping', () => {
    expect(formatEUR(3890000).replace(/\s/g, ' ')).toBe('38.900 €');
  });
});
