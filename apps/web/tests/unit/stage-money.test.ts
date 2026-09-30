import { describe, expect, it } from 'vitest';
import { formatEUR } from '@leaddesk/shared';
import { parseEurToCents } from '@/components/leads/stage/money';

describe('parseEurToCents (FR-013)', () => {
  it.each([
    ['36500', 3650000],
    ['36.500', 3650000],
    ['36.500 €', 3650000],
    ['36.500,50', 3650050],
    ['36500.5', 3650050],
    ['1.000.000', 100000000],
    ['0,99', 99],
    [' 100 ', 10000],
  ])('%s -> %d cents', (input, cents) => {
    expect(parseEurToCents(input)).toBe(cents);
  });

  it.each(['', '0', '0,00', 'abc', '-5', '1.000.000,01', '2000000'])('%j is rejected', (input) => {
    expect(parseEurToCents(input)).toBeNull();
  });

  it('displays in de-DE', () => {
    expect(formatEUR(3650000).replace(/\s/g, ' ')).toBe('36.500 €');
  });
});
