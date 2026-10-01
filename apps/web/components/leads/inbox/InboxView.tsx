'use client';

import { getSharedQueryClient } from '@/lib/sse/queryClient';
import { Suspense, useEffect, useState } from 'react';
import { QueryClientProvider, keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LeadListResult } from '@/server/services/lead-query';
import { Button } from '@/components/ui/button';
import { BulkActionBar } from '@/components/leads/assign/BulkActionBar';
import { fetchLeads } from './inbox-api';
import type { EmptyKind } from './EmptyState';
import { activeFilterKeys, toQueryString } from './inbox-params';
import { InboxFilters } from './InboxFilters';
import { InboxSearch } from './InboxSearch';
import { InboxTable } from './InboxTable';
import { KanbanBoard } from './KanbanBoard';
import { InboxTabs, type TabCaps } from './InboxTabs';
import { DueTodayWidget } from '@/components/followups/due-today-widget';
import { StatChips, type StatChipKey } from './StatChips';
import { useInboxParams } from './useInboxParams';
import { ScoringInfoModal } from './ScoringInfoModal';

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
  teams?: { id: string; name: string }[];
};

type ViewMode = 'table' | 'board';
const VIEW_MODE_KEY = 'leaddesk:inbox-view';

/** View mode survives reloads (per browser); the server render always starts as the board. */
function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('board');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_MODE_KEY) === 'table') setMode('table');
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);
  const set = (m: ViewMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, m);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
  };
  return [mode, set];
}

function Inbox({ caps, initialData, initialKey, owners, teams }: Props) {
  const { params, patch, clear } = useInboxParams();
  const [viewMode, setViewMode] = useViewMode();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const qs = toQueryString(params);

  // Query key contract for F12: prefix ['leads'] is invalidated on lead.* events. In board mode
  // this query only feeds the tabs and chips; each column fetches its own stage.
  const query = useQuery({
    queryKey: ['leads', params],
    queryFn: () => fetchLeads(params),
    placeholderData: keepPreviousData,
    initialData: qs === initialKey ? initialData : undefined,
  });

  // Selection is per result set: drop it when the filters, tab or page change.
  useEffect(() => setSelected(new Set()), [qs]);
  const selectedItems = (query.data?.items ?? []).filter((i) => selected.has(i.id));
  const selectedTeams = new Set(selectedItems.map((i) => i.teamId));
  const bulkTeamId = selectedTeams.size === 1 ? ([...selectedTeams][0] ?? null) : null;

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
      <h1 className="sr-only">Lead inbox</h1>
      {data && (
        <StatChips
          counts={data.counts}
          onSelect={onChip}
          scopeLabel={caps.leader ? (caps.orgWide ? 'Organisation' : 'Your team') : undefined}
        />
      )}
      <DueTodayWidget leader={caps.leader} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {data && (
          <InboxTabs
            caps={caps}
            counts={data.counts}
            active={data.view}
            onSelect={(view) => patch({ view })}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-md border border-slate-700"
            role="group"
            aria-label="View mode"
          >
            <button
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
              className={`flex h-9 items-center rounded-l-md px-2.5 text-sm transition-colors ${
                viewMode === 'table'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18M3 15h18M9 3v18" />
              </svg>
            </button>
            <button
              aria-label="Board view"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              className={`flex h-9 items-center rounded-r-md px-2.5 text-sm transition-colors ${
                viewMode === 'board'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="12" rx="1" />
                <rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
            </button>
          </div>
          <ScoringInfoModal />
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
        teams={teams}
        onPatch={patch}
        onClear={clear}
      />

      {viewMode === 'board' ? (
        <KanbanBoard params={params} canAssign={caps.leader} />
      ) : (
        <InboxTable
          items={data?.items}
          loading={query.isPending}
          error={query.isError}
          onRetry={() => query.refetch()}
          showOwner={data?.view !== 'mine'}
          emptyKind={emptyKind}
          onEmptyAction={() => (emptyKind === 'filtered' ? clear() : patch({ view: 'unassigned' }))}
          selectable={caps.leader}
          selectedIds={selected}
          onSelectionChange={setSelected}
        />
      )}

      {viewMode === 'table' && caps.leader && selected.size > 0 && (
        <BulkActionBar
          teamId={bulkTeamId}
          selectedIds={[...selected]}
          onClear={() => setSelected(new Set())}
        />
      )}

      {viewMode === 'table' && data && data.total > 0 && (
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
      <Suspense>
        <Inbox {...props} />
      </Suspense>
    </QueryClientProvider>
  );
}
