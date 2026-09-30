export const BUDGET_OPTIONS = [
  { value: 'LT20', label: 'Under 20.000 €' },
  { value: '20_30', label: '20.000 – 30.000 €' },
  { value: '30_40', label: '30.000 – 40.000 €' },
  { value: '40_55', label: '40.000 – 55.000 €' },
  { value: 'GE55', label: '55.000 € and up' },
] as const;

export type BudgetBand = (typeof BUDGET_OPTIONS)[number]['value'] | '';

export function budgetRange(band: BudgetBand): { budgetMin?: number; budgetMax?: number } {
  switch (band) {
    case 'LT20':
      return { budgetMax: 2_000_000 };
    case '20_30':
      return { budgetMin: 2_000_000, budgetMax: 3_000_000 };
    case '30_40':
      return { budgetMin: 3_000_000, budgetMax: 4_000_000 };
    case '40_55':
      return { budgetMin: 4_000_000, budgetMax: 5_500_000 };
    case 'GE55':
      return { budgetMin: 5_500_000 };
    default:
      return {};
  }
}
