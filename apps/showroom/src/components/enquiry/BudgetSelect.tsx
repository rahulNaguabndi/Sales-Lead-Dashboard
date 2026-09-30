import { BUDGET_OPTIONS, type BudgetBand } from '../../lib/budget';

export function BudgetSelect({
  id,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  value: BudgetBand;
  onChange: (b: BudgetBand) => void;
  describedBy?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as BudgetBand)} aria-describedby={describedBy}>
      <option value="">No preference</option>
      {BUDGET_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
