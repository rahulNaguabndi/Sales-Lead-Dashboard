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
}: {
  counts: TabCounts;
  onSelect: (key: StatChipKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Summary">
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
