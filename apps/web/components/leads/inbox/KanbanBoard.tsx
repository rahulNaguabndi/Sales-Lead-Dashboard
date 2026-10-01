'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { OPEN_STAGES, STAGES, stageLabel, type Stage } from '@leaddesk/shared';
import type { LeadListResult } from '@/server/services/lead-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';
import { KanbanCard } from './KanbanCard';
import { fetchLeads } from './inbox-api';
import { csvValues, type InboxParams } from './inbox-params';
import { useInboxLive } from './live-slot';

const COLUMN_PAGE = 25;

/**
 * Columns follow the query: the stage filter if set, otherwise the open stages, plus Won/Lost when
 * "Show closed" is on. Empty Won/Lost columns are never shown for a list that excludes them.
 */
export function boardStages(params: InboxParams): Stage[] {
  const picked = csvValues(params.stage);
  if (picked.length) return STAGES.filter((s) => picked.includes(s));
  return params.closed === 'true' ? [...OPEN_STAGES, 'WON', 'LOST'] : [...OPEN_STAGES];
}

/** Each column's own query: same filters, one stage, real `total`, paged with "Show more". */
export const columnParams = (params: InboxParams, stage: Stage): InboxParams => {
  const { page: _page, pageSize: _size, ...rest } = params;
  void _page;
  void _size;
  return { ...rest, stage, pageSize: String(COLUMN_PAGE) };
};

function Column({
  stage,
  params,
  canAssign,
  highlightedIds,
}: {
  stage: Stage;
  params: InboxParams;
  canAssign: boolean;
  highlightedIds: ReadonlySet<string>;
}) {
  const colParams = columnParams(params, stage);
  // Prefix ['leads'] so F12 lead.* events and local mutations refresh every column.
  const query = useInfiniteQuery({
    queryKey: ['leads', 'board', colParams],
    queryFn: ({ pageParam }) => fetchLeads({ ...colParams, page: String(pageParam) }),
    initialPageParam: 1,
    getNextPageParam: (last: LeadListResult) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total;
  const remaining = total === undefined ? 0 : total - items.length;
  const now = Date.now();

  return (
    <section
      aria-label={`${stageLabel(stage)}: ${total ?? 'loading'} leads`}
      data-testid={`board-col-${stage}`}
      className="flex min-w-[15rem] flex-1 basis-0 flex-col rounded-lg border border-border bg-muted/30"
    >
      <header className="flex items-center justify-between rounded-t-lg bg-muted/80 p-3">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STAGE_COLORS[stage])}>
          {stageLabel(stage)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground" data-testid="col-count">
          {total ?? '…'}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {query.isPending &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <Skeleton className="mb-2 h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        {query.isError && (
          <p role="alert" className="py-4 text-center text-xs text-red-400">
            Could not load.{' '}
            <button className="underline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </p>
        )}
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            now={now}
            highlighted={highlightedIds.has(item.id)}
            canAssign={canAssign}
          />
        ))}
        {query.isSuccess && items.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">No leads in this stage</p>
        )}
        {remaining > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            data-testid="col-more"
          >
            {query.isFetchingNextPage
              ? 'Loading…'
              : `Show ${Math.min(remaining, COLUMN_PAGE)} more (${remaining} not shown)`}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Inbox board: one independently paged query per stage, so counts are never truncated. */
export function KanbanBoard({
  params,
  canAssign = false,
}: {
  params: InboxParams;
  canAssign?: boolean;
}) {
  const { highlightedIds } = useInboxLive();
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 overflow-x-auto pb-4" data-testid="kanban-board">
        {boardStages(params).map((stage) => (
          <Column
            key={stage}
            stage={stage}
            params={params}
            canAssign={canAssign}
            highlightedIds={highlightedIds}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Moving leads between stages and stage values live on the{' '}
        <Link href="/pipeline" className="underline">
          Pipeline
        </Link>
        .
      </p>
    </div>
  );
}
