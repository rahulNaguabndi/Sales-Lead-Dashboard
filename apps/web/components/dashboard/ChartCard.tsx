'use client';

import { useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

type Props<T> = {
  title: string;
  /** One line saying what is counted, so similar numbers on other screens can be reconciled. */
  subtitle?: string;
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  /** Accessible table alternative to the chart. */
  table?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
};

/** Card shell with loading skeleton, empty state, inline error + Retry, and View-as-table toggle. */
export function ChartCard<T>({ title, subtitle, query, isEmpty, table, children }: Props<T>) {
  const [asTable, setAsTable] = useState(false);
  const { data, isLoading, isError, refetch } = query;
  return (
    <section
      className="rounded-lg border bg-card p-4"
      aria-label={title}
      data-testid={`widget-${title.toLowerCase().replace(/\W+/g, '-')}`}
    >
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {table && data && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        )}
      </header>
      {isLoading ? (
        <div className="h-48 animate-pulse rounded bg-muted" aria-busy="true" />
      ) : isError ? (
        <div role="alert" className="text-sm text-muted-foreground">
          Could not load this widget.{' '}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : data && isEmpty?.(data) ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No leads in this period · Try Last 90 days
        </p>
      ) : data ? (
        asTable && table ? (
          table(data)
        ) : (
          children(data)
        )
      ) : null}
    </section>
  );
}
