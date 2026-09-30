import { describe, expect, it } from 'vitest';
import { formatBudget, formatEUR, formatPhone } from './format';

describe('detail format helpers', () => {
  it('formats EUR from cents', () => {
    expect(formatEUR(3_890_000).replace(/\s| /g, ' ')).toBe('38.900 €');
  });
  it('formats budgets', () => {
    expect(formatBudget(null, null)).toBe('Not specified');
    expect(formatBudget(null, 4_000_000)).toMatch(/^up to 40\.000/);
    expect(formatBudget(2_500_000, 4_000_000)).toMatch(/25\.000.*40\.000/);
    expect(formatBudget(2_500_000, null)).toMatch(/^from 25\.000/);
  });
  it('formats international phones', () => {
    expect(formatPhone('+491701234567')).toBe('+49 170 123 456 7');
    expect(formatPhone(null)).toBe('—');
    expect(formatPhone('')).toBe('—');
    expect(formatPhone('0170 123')).toBe('0170123');
  });
});
