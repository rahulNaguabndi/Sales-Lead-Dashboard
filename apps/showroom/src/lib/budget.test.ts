import { describe, expect, it } from 'vitest';
import { budgetRange } from './budget';

describe('budgetRange', () => {
  it('maps bands to cents', () => {
    expect(budgetRange('LT20')).toEqual({ budgetMax: 2_000_000 });
    expect(budgetRange('20_30')).toEqual({ budgetMin: 2_000_000, budgetMax: 3_000_000 });
    expect(budgetRange('30_40')).toEqual({ budgetMin: 3_000_000, budgetMax: 4_000_000 });
    expect(budgetRange('40_55')).toEqual({ budgetMin: 4_000_000, budgetMax: 5_500_000 });
    expect(budgetRange('GE55')).toEqual({ budgetMin: 5_500_000 });
  });
  it('empty → none', () => {
    expect(budgetRange('')).toEqual({});
  });
});
