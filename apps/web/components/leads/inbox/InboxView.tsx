'use client';

import { getSharedQueryClient } from '@/lib/sse/queryClient';
import { useState } from 'react';
import {
  QueryClientProvider,
  keepPreviousData,
  useQuery,
} from '@tanstack/react-query';
import type { LeadListResult } from '@/server/services/lead-query';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import type { EmptyKind } from './EmptyState';
import { activeFilterKeys, toQueryString } from './inbox-params';
import { InboxFilters } from './InboxFilters';
import { InboxSearch } from './InboxSearch';
import { InboxTable } from './InboxTable';
import { InboxTabs, type TabCaps } from './InboxTabs';
import { DueTodayWidget } from '@/components/followups/due-today-widget';
import { StatChips, type StatChipKey } from './StatChips';
import { useInboxParams } from './useInboxParams';

const SORTS: [string, string][] = [
  ['rank', 'Recommended'],
  ['newest', 'Newest'],
  ['oldest_untouched', 'Oldest untouched'],
  ['next_follow_up', 'Next follow-up'],
  ['score', 'Score'],
  ['last_activity', 'Last activity'],
];

type Props = {
  caps: TabCaps;
  initialData: LeadListResult;
  initialKey: string;
  owners: { id: string; name: string }[];
};

function Inbox({ caps, initialData, initialKey, owners }: Props) {
  const { params, patch, clear } = useInboxParams();
  const qs = toQueryString(params);

  // Query key contract for F12: prefix ['leads'] is invalidated on lead.* events.
  const query = useQuery({
    queryKey: ['leads', params],
    queryFn: async (): Promise<LeadListResult> => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const sp = new URLSearchParams(qs);
      if (tz) sp.set('tz', tz);
      const res = await apiFetch(`/api/leads?${sp.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    placeholderData: keepPreviousData,
    initialData: qs === initialKey ? initialData : undefined,
  });

  const data = query.data;
  const filtersActive = activeFilterKeys(params).length > 0;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  let emptyKind: EmptyKind = 'tab';
  if (filtersActive) emptyKind = 'filtered';
  else if (data?.view === 'unassigned') emptyKind = 'unassigned';
  else if (data?.view === 'mine') emptyKind = 'no-leads';

  const onChip = (key: StatChipKey) => {
    if (key === 'dueToday') patch({ view: 'due_today' });
    else if (key === 'goingCold') patch({ view: 'going_cold' });
    else if (key === 'overdue') patch({ view: undefined, overdue: 'true' });
    else patch({ view: undefined, stage: 'NEW', sort: 'oldest_untouched' });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="sr-only">Lead inbox</h2>
      {data && <StatChips counts={data.counts} onSelect={onChip} />}
      <DueTodayWidget />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {data && (
          <InboxTabs
            caps={caps}
            counts={data.counts}
            active={data.view}
            onSelect={(view) => patch({ view })}
          />
        )}
        <div className="flex items-center gap-2">
          <InboxSearch value={params.q ?? ''} onChange={(q) => patch({ q })} />
          <select
            aria-label="Sort"
            data-testid="inbox-sort"
            className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm"
            value={params.sort ?? 'rank'}
            onChange={(e) =>
              patch({ sort: e.target.value === 'rank' ? undefined : e.target.value })
            }
          >
            {SORTS.map(([v, label]) => (
              <option key={v} value={v}>
                Sort: {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <InboxFilters
        leader={caps.leader}
        params={params}
        owners={owners}
        onPatch={patch}
        onClear={clear}
      />

      <InboxTable
        items={data?.items}
        loading={query.isPending}
        error={query.isError}
        onRetry={() => query.refetch()}
        showOwner={data?.view !== 'mine'}
        emptyKind={emptyKind}
        onEmptyAction={() => (emptyKind === 'filtered' ? clear() : patch({ view: 'unassigned' }))}
      />

      {data && data.total > 0 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-end gap-3 text-xs text-slate-400"
          data-testid="inbox-pagination"
        >
          <span data-testid="inbox-total">
            {data.total} lead{data.total === 1 ? '' : 's'}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => patch({ page: String(data.page - 1) })}
          >
            ‹ Prev
          </Button>
          <span>
            Page {data.page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={data.page >= totalPages}
            onClick={() => patch({ page: String(data.page + 1) })}
          >
            Next ›
          </Button>
          <select
            aria-label="Page size"
            className="h-8 rounded-md border border-slate-700 bg-slate-950 px-1"
            value={data.pageSize}
            onChange={(e) =>
              patch({ pageSize: e.target.value === '25' ? undefined : e.target.value })
            }
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </nav>
      )}
    </div>
  );
}

export function InboxView(props: Props) {
  const [client] = useState(() => getSharedQueryClient());
  return (
    <QueryClientProvider client={client}>
      <Inbox {...props} />
    </QueryClientProvider>
  );
}
