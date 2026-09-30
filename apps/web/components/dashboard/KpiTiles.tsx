'use client';

import Link from 'next/link';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import type { Kpi } from '@leaddesk/shared';
import { describeDelta } from './formatters';

type TileProps = {
  label: string;
  kpi: Kpi;
  format: (v: number | null) => string;
  href?: string;
  hero?: boolean;
  unit?: 'pct-points' | 'relative';
  hint?: string;
};

export function KpiTile({ label, kpi, format, href, hero, unit, hint }: TileProps) {
  const delta = describeDelta(kpi.value, kpi.prev, kpi.lowerIsBetter, unit);
  const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '';
  const color =
    delta.good === null
      ? 'text-muted-foreground'
      : delta.good
        ? 'text-[var(--dash-good)]'
        : 'text-[var(--dash-bad)]';
  const body = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`${hero ? 'text-3xl' : 'text-2xl'} font-semibold tabular-nums`}
        title={kpi.value === null ? (hint ?? 'No data in this period') : undefined}
        data-testid={`kpi-${label.toLowerCase().replace(/\W+/g, '-')}`}
      >
        {format(kpi.value)}
      </div>
      <div className={`text-xs ${color}`} aria-label={`Change vs previous period: ${delta.text}`}>
        {arrow} {delta.text} <span className="text-muted-foreground">vs prev.</span>
      </div>
      {kpi.series && kpi.series.length > 1 && (
        <div className="mt-1 h-8" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kpi.series}>
              <Line
                dataKey="v"
                stroke="var(--dash-1)"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
  const cls = `block rounded-lg border bg-card p-3 ${hero ? 'lg:col-span-2' : ''}`;
  return href ? (
    <Link href={href} className={`${cls} hover:bg-muted/50 focus-visible:ring-2`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string; href?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-2 text-sm">
      {items.map((i) => (
        <li key={i.label}>
          <span className="text-muted-foreground">{i.label}: </span>
          {i.href ? (
            <Link href={i.href} className="font-medium tabular-nums underline">
              {i.value}
            </Link>
          ) : (
            <span className="font-medium tabular-nums">{i.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
