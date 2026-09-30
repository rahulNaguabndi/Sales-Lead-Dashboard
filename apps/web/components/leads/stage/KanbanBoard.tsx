'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LEAD_SOURCES,
  PRIORITIES,
  STAGE_LABELS,
  allowedTargets,
  formatEUR,
  type Role,
  type Stage,
} from '@leaddesk/shared';
import type { PipelineCard, PipelineColumn } from '@/server/services/stage';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_COLORS } from '@/components/ui/tokens';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { CardBody, KanbanCard } from './KanbanCard';
import { MoveMenu } from './MoveMenu';
import { useStageChanger, type ChangeTarget } from './use-stage-changer';
import { announce, patchStage, type StageRequest, type StageResult } from './use-stage-mutation';

type Data = { columns: PipelineColumn[] };
type Filters = { owner: string; source: string; priority: string };

const sourceLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Moves one card between columns in the cached board, for the optimistic update. */
export function moveCard(data: Data, cardId: string, to: Stage): Data {
  let card: PipelineCard | undefined;
  const without = data.columns.map((c) => {
    const found = c.leads.find((l) => l.id === cardId);
    if (!found) return c;
    card = found;
    return { ...c, count: c.count - 1, leads: c.leads.filter((l) => l.id !== cardId) };
  });
  if (!card) return data;
  const moved = { ...card, stage: to, daysInStage: 0 };
  return {
    columns: without.map((c) =>
      c.stage === to ? { ...c, count: c.count + 1, leads: [moved, ...c.leads] } : c,
    ),
  };
}

function Column({
  column,
  dim,
  highlight,
  children,
}: {
  column: PipelineColumn;
  dim: boolean;
  highlight: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STAGE_LABELS[column.stage]} column`}
      data-testid={`kanban-col-${column.stage}`}
      className={cn(
        'flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-muted/30',
        dim && 'opacity-40',
        highlight && isOver && 'ring-2 ring-ring',
      )}
    >
      <header className="sticky top-0 z-10 rounded-t-lg bg-muted/80 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span
            className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STAGE_COLORS[column.stage])}
          >
            {STAGE_LABELS[column.stage]}
            {column.stage === 'WON' || column.stage === 'LOST' ? ' (30d)' : ''}
          </span>
          <span className="text-xs text-muted-foreground" data-testid="col-count">
            {column.count}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{formatEUR(column.valueCents)}</div>
      </header>
      <div className="flex flex-col gap-2 p-2">{children}</div>
    </section>
  );
}

export function KanbanBoard({
  role,
  owners,
}: {
  role: Role;
  owners: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>({ owner: '', source: '', priority: '' });
  const key = ['pipeline', filters] as const;
  const { data, isLoading, isError, refetch } = useQuery<Data>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiFetch(`/api/pipeline${toQuery(filters)}`);
      if (!res.ok) throw new Error('Failed to load the pipeline');
      return res.json();
    },
  });

  const [active, setActive] = useState<PipelineCard | null>(null);
  const [menuFor, setMenuFor] = useState<PipelineCard | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const send = useCallback(
    async (lead: ChangeTarget, body: StageRequest): Promise<StageResult> => {
      await qc.cancelQueries({ queryKey: ['pipeline'] });
      const snapshot = qc.getQueryData<Data>(key);
      if (snapshot) qc.setQueryData<Data>(key, moveCard(snapshot, lead.id, body.to));
      const result = await patchStage(lead.id, body);
      announce(result, body.to);
      if (!result.ok && snapshot) qc.setQueryData<Data>(key, snapshot);
      void qc.invalidateQueries({ queryKey: ['pipeline'] });
      if (result.ok) void qc.invalidateQueries({ queryKey: ['leads'] });
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, filters],
  );

  const { request, dialogs } = useStageChanger({ send });

  const target = (c: PipelineCard): ChangeTarget => ({
    id: c.id,
    version: c.version,
    stage: c.stage,
    vehicleModel: c.vehicleModel,
  });

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current?.card as PipelineCard) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const card = e.active.data.current?.card as PipelineCard | undefined;
    setActive(null);
    const to = e.over?.id as Stage | undefined;
    if (!card || !to || to === card.stage) return;
    if (!allowedTargets(card.stage, role).includes(to)) return;
    void request(target(card), to);
  };

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
  const valid = active ? new Set<Stage>(allowedTargets(active.stage, role)) : null;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold">Pipeline</h1>
        {owners.length > 0 && role !== 'REP' && (
          <select aria-label="Owner" className={selectCls} value={filters.owner} onChange={set('owner')}>
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Source" className={selectCls} value={filters.source} onChange={set('source')}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
        <select aria-label="Priority" className={selectCls} value={filters.priority} onChange={set('priority')}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {sourceLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div className="flex gap-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-[280px] shrink-0" />
          ))}
        </div>
      )}
      {isError && (
        <div role="alert" className="rounded-md border border-red-500/40 p-4 text-sm">
          Could not load the pipeline.{' '}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
        >
          <div className="flex flex-1 items-start gap-3 overflow-x-auto pb-4" data-testid="kanban-board">
            {data.columns.map((col) => (
              <Column
                key={col.stage}
                column={col}
                dim={!!active && active.stage !== col.stage && !valid?.has(col.stage)}
                highlight={!!valid?.has(col.stage)}
              >
                {col.leads.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No leads in this stage
                  </p>
                )}
                {col.leads.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    draggable={allowedTargets(card.stage, role).length > 0}
                    dragging={active?.id === card.id}
                    onMove={setMenuFor}
                  />
                ))}
                {col.more > 0 && (
                  <Link
                    href={`/inbox?stage=${col.stage}`}
                    className="py-2 text-center text-xs underline"
                  >
                    +{col.more} more → open in inbox
                  </Link>
                )}
              </Column>
            ))}
          </div>
          <DragOverlay>
            {active && (
              <div className="rounded-md border border-border bg-card p-3 shadow-lg">
                <CardBody card={active} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {menuFor && (
        <MoveMenu
          open
          from={menuFor.stage}
          name={menuFor.customerName}
          role={role}
          onClose={() => setMenuFor(null)}
          onPick={(to) => {
            const card = menuFor;
            setMenuFor(null);
            void request(target(card), to);
          }}
        />
      )}
      {dialogs}
    </div>
  );
}
