'use client';

import { useEffect, useState } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import type {
  ActivityItem,
  ActivityKindFilter,
  ActivityOrder,
  ActivityPage,
} from '@/components/leads/detail/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { SystemEntry } from './SystemEntry';
import { TimelineControls, ORDER_STORAGE_KEY } from './TimelineControls';
import { TimelineDayGroup, dayKey } from './TimelineDayGroup';
import { TimelineEntry } from './TimelineEntry';

const PAGE_SIZE = 50;

async function fetchPage(
  leadId: string,
  order: ActivityOrder,
  kind: ActivityKindFilter,
  cursor: string | null,
): Promise<ActivityPage> {
  const qs = new URLSearchParams({ order, kind, limit: String(PAGE_SIZE) });
  if (cursor) qs.set('cursor', cursor);
  const res = await apiFetch(`/api/leads/${leadId}/activities?${qs}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as ActivityPage;
}

export function groupByDay(items: ActivityItem[]): { key: number; items: ActivityItem[] }[] {
  const groups: { key: number; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** Query key prefix shared with the composer's optimistic insert and F12's activity.created. */
export const activitiesKey = (leadId: string) => ['lead', leadId, 'activities'] as const;

/**
 * Server-rendered first page (newest first, all kinds) hydrates the feed; later pages load on
 * demand. The feed lives in TanStack Query so a logged activity appears immediately (optimistic
 * insert) and live events refresh it without a reload.
 */
export function Timeline({ leadId, initial }: { leadId: string; initial: ActivityPage }) {
  const [order, setOrder] = useState<ActivityOrder>('desc');
  const [kind, setKind] = useState<ActivityKindFilter>('ALL');
  const isInitialView = order === 'desc' && kind === 'ALL';

  const query = useInfiniteQuery({
    queryKey: [...activitiesKey(leadId), { order, kind }],
    queryFn: ({ pageParam }) => fetchPage(leadId, order, kind, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: isInitialView
      ? ({ pages: [initial], pageParams: [null] } satisfies InfiniteData<
          ActivityPage,
          string | null
        >)
      : undefined,
    staleTime: 5_000,
  });

  // Newest first, always, on every visit: the latest touch is what a rep needs to see. "Oldest
  // first" is a per-view toggle and is no longer remembered (a stale stored "asc" made every lead
  // open with the latest activity at the bottom), so drop any old stored preference.
  useEffect(() => {
    try {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing to clean up.
    }
  }, []);

  const changeOrder = (o: ActivityOrder) => setOrder(o);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByDay(items);
  const loading = query.isFetching;

  return (
    <section aria-label="Timeline" className="space-y-3">
      <TimelineControls order={order} kind={kind} onOrder={changeOrder} onKind={setKind} />
      <ul role="feed" aria-busy={loading} aria-label="Lead activity" className="space-y-3">
        {query.isPending ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : groups.length === 0 && !query.isError ? (
          <li className="py-8 text-center text-sm text-muted-foreground">No activity yet</li>
        ) : (
          groups.map((g) => (
            <TimelineDayGroup key={g.key} dayKey={g.key}>
              {g.items.map((it) =>
                it.kind === 'SYSTEM' ? (
                  <SystemEntry key={it.id} item={it} />
                ) : (
                  <TimelineEntry key={it.id} item={it} />
                ),
              )}
            </TimelineDayGroup>
          ))
        )}
      </ul>
      {query.isError && (
        <div role="alert" className="flex items-center gap-2 text-sm text-red-400">
          Couldn&apos;t load activity.
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.hasNextPage && !query.isError && (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {order === 'desc' ? 'Load older' : 'Load newer'}
        </Button>
      )}
    </section>
  );
}
