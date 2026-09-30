'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadListItem } from '@/server/services/lead-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, type EmptyKind } from './EmptyState';
import { LeadRow } from './LeadRow';
import { useInboxLive } from './live-slot';

export function InboxTable({
  items,
  loading,
  error,
  onRetry,
  showOwner,
  emptyKind,
  onEmptyAction,
}: {
  items: LeadListItem[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  showOwner: boolean;
  emptyKind: EmptyKind;
  onEmptyAction: () => void;
}) {
  const router = useRouter();
  const body = useRef<HTMLTableSectionElement>(null);
  const { highlightedIds } = useInboxLive();
  const now = Date.now();

  const moveFocus = (dir: 1 | -1) => {
    const rows = [...(body.current?.querySelectorAll<HTMLElement>('[data-lead-row]') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[i === -1 ? (dir === 1 ? 0 : rows.length - 1) : i + dir];
    next?.focus();
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="m-3 flex items-center justify-between rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300"
        >
          <span>Could not load leads.</span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
      <table className="w-full text-left text-sm" data-testid="inbox-table">
        <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase text-slate-400">
          <tr className="h-8 border-b border-slate-800">
            <th className="w-8 pl-3" aria-label="Priority" />
            <th className="px-2">Customer</th>
            <th className="hidden px-2 lg:table-cell">Vehicle</th>
            <th className="hidden px-2 lg:table-cell">Source</th>
            <th className="hidden px-2 lg:table-cell">Stage</th>
            {showOwner && <th className="hidden px-2 lg:table-cell">Owner</th>}
            <th className="hidden px-2 lg:table-cell">Age</th>
            <th className="hidden px-2 lg:table-cell">Last activity</th>
            <th className="px-2 pr-3 text-right">Next</th>
          </tr>
        </thead>
        <tbody
          ref={body}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              moveFocus(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              moveFocus(-1);
            }
          }}
        >
          {loading &&
            !items &&
            Array.from({ length: 10 }).map((_, i) => (
              <tr key={i} className="h-10 border-b border-slate-800" data-testid="inbox-skeleton">
                <td colSpan={showOwner ? 9 : 8} className="px-3">
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            ))}
          {items?.map((item) => (
            <LeadRow
              key={item.id}
              item={item}
              showOwner={showOwner}
              highlighted={highlightedIds.has(item.id)}
              now={now}
              onOpen={(id) => router.push(`/leads/${id}`)}
            />
          ))}
        </tbody>
      </table>
      {items && items.length === 0 && !error && (
        <EmptyState kind={emptyKind} onAction={onEmptyAction} />
      )}
    </div>
  );
}
