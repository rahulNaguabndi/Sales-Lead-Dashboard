'use client';

import type { TabCounts } from '@/server/services/lead-query';

export type StatChipKey = 'dueToday' | 'overdue' | 'newUntouched' | 'goingCold';

const CHIPS: { key: StatChipKey; label: string }[] = [
  { key: 'dueToday', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'newUntouched', label: 'New' },
  { key: 'goingCold', label: 'Going cold' },
];

export function StatChips({
  counts,
  onSelect,
  scopeLabel,
}: {
  counts: TabCounts;
  onSelect: (key: StatChipKey) => void;
  /** Leaders: says whose numbers these are, so they don't clash with the personal widget. */
  scopeLabel?: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={scopeLabel ? `${scopeLabel} summary` : 'Summary'}
    >
      {scopeLabel && (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {scopeLabel}
        </span>
      )}
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          data-testid={`chip-${c.key}`}
          onClick={() => onSelect(c.key)}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
        >
          {c.label} <span className="font-semibold tabular-nums">{counts[c.key]}</span>
        </button>
      ))}
    </div>
  );
}
