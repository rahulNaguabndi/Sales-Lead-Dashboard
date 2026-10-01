'use client';

import Link from 'next/link';
import { AlertTriangle, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DashboardFilters, DashboardPeriod, LeaderboardRow, TeamRow } from '@leaddesk/shared';
import { buildInboxHref } from '@/lib/dashboard-href';
import { formatDuration, formatEur, formatPct } from './formatters';

type Row = LeaderboardRow | TeamRow;
type ColKey =
  | 'open'
  | 'newInPeriod'
  | 'coveragePct'
  | 'avgFrtMinutes'
  | 'slaBreaches'
  | 'overdue'
  | 'won'
  | 'revenueCents';
type Col = { key: ColKey; label: string; fmt: (r: Row) => string };

const COLS: Col[] = [
  { key: 'open', label: 'Open', fmt: (r) => String(r.open) },
  { key: 'newInPeriod', label: 'New', fmt: (r) => String(r.newInPeriod) },
  { key: 'coveragePct', label: 'Coverage', fmt: (r) => formatPct(r.coveragePct) },
  { key: 'avgFrtMinutes', label: 'Avg FRT', fmt: (r) => formatDuration(r.avgFrtMinutes) },
  { key: 'slaBreaches', label: 'SLA breaches', fmt: (r) => String(r.slaBreaches) },
  { key: 'overdue', label: 'Overdue', fmt: (r) => String(r.overdue) },
  { key: 'won', label: 'Won', fmt: (r) => String(r.won) },
  { key: 'revenueCents', label: 'Revenue', fmt: (r) => formatEur(r.revenueCents) },
];

type Props = {
  title: string;
  rows: Row[];
  mode: 'rep' | 'team';
  filters: DashboardFilters;
  period: DashboardPeriod;
  highlightId?: string;
  /** Team mode: selecting a row drills into that team. */
  onSelectRow?: (id: string) => void;
};

export function LeaderboardTable({
  title,
  rows,
  mode,
  filters,
  period,
  highlightId,
  onSelectRow,
}: Props) {
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>({ key: 'newInPeriod', dir: -1 });
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const av = a[sort.key] ?? -Infinity;
        const bv = b[sort.key] ?? -Infinity;
        return (av - bv) * sort.dir || 0;
      }),
    [rows, sort],
  );
  const idOf = (r: Row) => ('userId' in r ? r.userId : r.teamId);
  const link = (r: Row, extra: Record<string, string>) =>
    buildInboxHref(
      filters,
      period,
      mode === 'rep' ? { owner: idOf(r), ...extra } : { team: idOf(r), ...extra },
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums" aria-label={title}>
        <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-3">{mode === 'rep' ? 'Rep' : 'Team'}</th>
            {COLS.map((c) => (
              <th
                key={c.key}
                className="px-2 py-1 text-right"
                aria-sort={
                  sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setSort((s) => ({
                      key: c.key,
                      dir: s.key === c.key ? (-s.dir as 1 | -1) : -1,
                    }))
                  }
                >
                  {c.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={idOf(r)}
              className={idOf(r) === highlightId ? 'bg-muted/60' : undefined}
              data-testid={`row-${r.name}`}
            >
              <th scope="row" className="py-1 pr-3 text-left font-medium">
                {onSelectRow ? (
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    aria-pressed={idOf(r) === highlightId}
                    onClick={() => onSelectRow(idOf(r))}
                  >
                    {r.name}
                  </button>
                ) : (
                  r.name
                )}
              </th>
              {COLS.map((c) => {
                const cell = c.fmt(r);
                const href =
                  c.key === 'overdue' && r.overdue > 0
                    ? link(r, { overdue: '1' })
                    : c.key === 'slaBreaches' && r.slaBreaches > 0
                      ? link(r, { sla: 'breached' })
                      : null;
                return (
                  <td
                    key={c.key}
                    className="px-2 py-1 text-right"
                    data-testid={`cell-${r.name}-${c.key}`}
                  >
                    {href ? (
                      <Link href={href} className="inline-flex items-center gap-1 underline">
                        {c.key === 'overdue' ? (
                          <AlertTriangle aria-hidden className="h-3.5 w-3.5 text-amber-400" />
                        ) : (
                          <Timer aria-hidden className="h-3.5 w-3.5 text-red-400" />
                        )}
                        {cell}
                      </Link>
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
