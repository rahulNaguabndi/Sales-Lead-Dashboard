'use client';

import { STAGES, type Stage } from '@leaddesk/shared';
import type { LeadListItem } from '@/server/services/lead-query';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { KanbanCard } from './KanbanCard';
import { useInboxLive } from './live-slot';

const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  TEST_DRIVE: 'Test Drive',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  COLD: 'Cold',
};

const STAGE_BORDER: Record<Stage, string> = {
  NEW: 'border-t-blue-500',
  CONTACTED: 'border-t-blue-600',
  QUALIFIED: 'border-t-indigo-500',
  TEST_DRIVE: 'border-t-violet-500',
  NEGOTIATION: 'border-t-fuchsia-500',
  WON: 'border-t-green-500',
  LOST: 'border-t-red-500',
  COLD: 'border-t-slate-500',
};

const STAGE_TEXT: Record<Stage, string> = {
  NEW: 'text-blue-300',
  CONTACTED: 'text-blue-300',
  QUALIFIED: 'text-indigo-300',
  TEST_DRIVE: 'text-violet-300',
  NEGOTIATION: 'text-fuchsia-300',
  WON: 'text-green-400',
  LOST: 'text-red-400',
  COLD: 'text-slate-400',
};

export function KanbanBoard({
  items,
  loading,
}: {
  items: LeadListItem[] | undefined;
  loading: boolean;
}) {
  const router = useRouter();
  const { highlightedIds } = useInboxLive();
  const now = Date.now();

  const grouped = new Map<Stage, LeadListItem[]>(STAGES.map((s) => [s, []]));
  for (const item of items ?? []) {
    grouped.get(item.stage)?.push(item);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" data-testid="kanban-board">
      {STAGES.map((stage) => {
        const cards = grouped.get(stage) ?? [];
        return (
          <div
            key={stage}
            className={cn(
              'flex w-64 shrink-0 flex-col rounded-lg border border-t-2 border-slate-800 bg-slate-950',
              STAGE_BORDER[stage],
            )}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  STAGE_TEXT[stage],
                )}
              >
                {STAGE_LABEL[stage]}
              </span>
              <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                {loading && !items ? '…' : cards.length}
              </span>
            </div>

            <div
              className="flex flex-col gap-2 overflow-y-auto p-2"
              style={{ maxHeight: 'calc(100vh - 280px)' }}
            >
              {loading &&
                !items &&
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <Skeleton className="mb-2 h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              {cards.map((item) => (
                <KanbanCard
                  key={item.id}
                  item={item}
                  now={now}
                  highlighted={highlightedIds.has(item.id)}
                  onOpen={(id) => router.push(`/leads/${id}`)}
                />
              ))}
              {!loading && cards.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-700">No leads</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
