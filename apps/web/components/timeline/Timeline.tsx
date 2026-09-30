'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Server-rendered first page (newest first, all kinds) hydrates the feed; later pages load on demand. */
export function Timeline({ leadId, initial }: { leadId: string; initial: ActivityPage }) {
  const [order, setOrder] = useState<ActivityOrder>('desc');
  const [kind, setKind] = useState<ActivityKindFilter>('ALL');
  const [items, setItems] = useState<ActivityItem[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const first = useRef(true);

  const load = useCallback(
    async (o: ActivityOrder, k: ActivityKindFilter, from: string | null) => {
      const mine = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchPage(leadId, o, k, from);
        if (mine !== seq.current) return;
        setItems((prev) => (from ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [leadId],
  );

  // Order preference is read after mount so the server render never mismatches.
  useEffect(() => {
    const stored = window.localStorage.getItem(ORDER_STORAGE_KEY);
    if (stored === 'asc') setOrder('asc');
  }, []);

  useEffect(() => {
    // The first render already has the server page (desc, ALL).
    if (first.current && order === 'desc' && kind === 'ALL') {
      first.current = false;
      return;
    }
    first.current = false;
    void load(order, kind, null);
  }, [order, kind, load]);

  const changeOrder = (o: ActivityOrder) => {
    window.localStorage.setItem(ORDER_STORAGE_KEY, o);
    setOrder(o);
  };

  const groups = groupByDay(items);

  return (
    <section aria-label="Timeline" className="space-y-3">
      <TimelineControls order={order} kind={kind} onOrder={changeOrder} onKind={setKind} />
      <ul role="feed" aria-busy={loading} aria-label="Lead activity" className="space-y-3">
        {loading && items.length === 0 ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : groups.length === 0 && !error ? (
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
      {error && (
        <div role="alert" className="flex items-center gap-2 text-sm text-red-400">
          Couldn&apos;t load activity.
          <Button size="sm" variant="outline" onClick={() => void load(order, kind, cursor)}>
            Retry
          </Button>
        </div>
      )}
      {cursor && !error && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load(order, kind, cursor)}
        >
          {order === 'desc' ? 'Load older' : 'Load newer'}
        </Button>
      )}
    </section>
  );
}
