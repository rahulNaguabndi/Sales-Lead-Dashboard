'use client';

import { useState } from 'react';
import {
  DASHBOARD_RANGES,
  SOURCE_GROUPS,
  sourceGroupLabel,
  type DashboardFilters,
} from '@leaddesk/shared';

const LABELS: Record<string, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
  custom: 'Custom',
};

type Props = {
  filters: DashboardFilters;
  setFilters: (p: Partial<DashboardFilters>) => void;
  teams?: { id: string; name: string }[];
  reps?: { id: string; name: string }[];
};

export function FilterBar({ filters, setFilters, teams, reps }: Props) {
  const [from, setFrom] = useState(filters.from ?? '');
  const [to, setTo] = useState(filters.to ?? '');
  const tooLong = from && to && (Date.parse(to) - Date.parse(from)) / 86_400_000 > 366;
  const invalid = Boolean(from && to && (from > to || tooLong));
  const sel = 'rounded border bg-background px-2 py-1 text-sm';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Dashboard filters">
      <select
        aria-label="Period"
        className={sel}
        value={filters.range}
        onChange={(e) =>
          setFilters({
            range: e.target.value as DashboardFilters['range'],
            from: undefined,
            to: undefined,
          })
        }
      >
        {DASHBOARD_RANGES.map((r) => (
          <option key={r} value={r}>
            {LABELS[r]}
          </option>
        ))}
      </select>
      {filters.range === 'custom' && (
        <>
          <input
            type="date"
            aria-label="From"
            className={sel}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            aria-label="To"
            className={sel}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            type="button"
            className="rounded border px-2 py-1 text-sm disabled:opacity-50"
            disabled={!from || !to || invalid}
            onClick={() => setFilters({ from, to })}
          >
            Apply
          </button>
          {invalid && (
            <span role="alert" className="text-xs text-[var(--dash-bad)]">
              {from > to ? 'Start must be before end' : 'Range is limited to 366 days'}
            </span>
          )}
        </>
      )}
      {teams && (
        <select
          aria-label="Team"
          className={sel}
          value={filters.teamId ?? ''}
          onChange={(e) => setFilters({ teamId: e.target.value || undefined, ownerId: undefined })}
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {reps && reps.length > 0 && (
        <select
          aria-label="Rep"
          className={sel}
          value={filters.ownerId ?? ''}
          onChange={(e) => setFilters({ ownerId: e.target.value || undefined })}
        >
          <option value="">All reps</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Source group"
        className={sel}
        value={filters.sourceGroup ?? ''}
        onChange={(e) =>
          setFilters({
            sourceGroup: (e.target.value || undefined) as DashboardFilters['sourceGroup'],
          })
        }
      >
        <option value="">All sources</option>
        {SOURCE_GROUPS.map((g) => (
          <option key={g} value={g}>
            {sourceGroupLabel(g)}
          </option>
        ))}
      </select>
    </div>
  );
}
