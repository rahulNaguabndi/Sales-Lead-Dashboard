'use client';

import { COUNTRIES, LEAD_SOURCES, VEHICLES, type OfferEligibilityRules } from '@leaddesk/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  value: OfferEligibilityRules;
  onChange: (next: OfferEligibilityRules) => void;
  disabled?: boolean;
};

/** Toggles one item of a multi-select; an empty selection removes the rule (empty arrays are invalid). */
export function toggleRule<K extends 'models' | 'countries' | 'sources'>(
  rules: OfferEligibilityRules,
  key: K,
  item: string,
): OfferEligibilityRules {
  const current = (rules[key] ?? []) as string[];
  const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
  const { [key]: _drop, ...rest } = rules;
  void _drop;
  return next.length ? ({ ...rest, [key]: next } as OfferEligibilityRules) : rest;
}

function Chips({
  label,
  options,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">
        {label} <span className="font-normal text-muted-foreground">(none selected = any)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(o.value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                on ? 'border-blue-500 bg-blue-500/20 text-blue-200' : 'hover:bg-muted',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EligibilityBuilder({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<OfferEligibilityRules>) => {
    const next = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof OfferEligibilityRules)[])
      if (next[k] === undefined) delete next[k];
    onChange(next);
  };

  return (
    <section aria-label="Who is eligible?" className="space-y-3 rounded-md border p-3">
      <h3 className="text-sm font-semibold">Who is eligible?</h3>
      <div className="grid gap-1.5">
        <label htmlFor="elig-customer" className="text-sm font-medium">
          Customer type
        </label>
        <select
          id="elig-customer"
          disabled={disabled}
          value={value.customerType ?? ''}
          onChange={(e) =>
            set({
              customerType: (e.target.value || undefined) as OfferEligibilityRules['customerType'],
            })
          }
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Anyone</option>
          <option value="NEW">New customers</option>
          <option value="RETURNING">Returning customers</option>
        </select>
      </div>
      <Chips
        label="Models"
        disabled={disabled}
        options={VEHICLES.map((v) => ({ value: v.slug, label: v.name }))}
        selected={value.models ?? []}
        onToggle={(v) => onChange(toggleRule(value, 'models', v))}
      />
      <Chips
        label="Countries"
        disabled={disabled}
        options={Object.entries(COUNTRIES).map(([code, c]) => ({
          value: code,
          label: `${code} ${c.name}`,
        }))}
        selected={value.countries ?? []}
        onToggle={(v) => onChange(toggleRule(value, 'countries', v))}
      />
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.requiresTradeIn === true}
            onChange={(e) => set({ requiresTradeIn: e.target.checked ? true : undefined })}
          />
          Requires a trade-in
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.requiresFinance === true}
            onChange={(e) => set({ requiresFinance: e.target.checked ? true : undefined })}
          />
          Requires finance
        </label>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="elig-budget" className="text-sm font-medium">
          Minimum budget (€)
        </label>
        <Input
          id="elig-budget"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          placeholder="No minimum"
          value={value.minBudget ? value.minBudget / 100 : ''}
          onChange={(e) => {
            const eur = Number(e.target.value);
            set({ minBudget: e.target.value && eur > 0 ? Math.round(eur * 100) : undefined });
          }}
        />
      </div>
      <Chips
        label="Lead sources"
        disabled={disabled}
        options={LEAD_SOURCES.map((s) => ({ value: s, label: s.replace('_', ' ').toLowerCase() }))}
        selected={value.sources ?? []}
        onToggle={(v) => onChange(toggleRule(value, 'sources', v))}
      />
    </section>
  );
}
