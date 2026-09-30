'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import type { PipelineCard } from '@/server/services/stage';
import { PriorityDot } from '@/components/leads/inbox/PriorityDot';
import { cn } from '@/lib/utils';

const initials = (name: string | null) =>
  name
    ? name
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '–';

export function CardBody({ card }: { card: PipelineCard }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${card.id}`}
          className="text-sm font-medium hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {card.customerName}
        </Link>
        <span
          title={card.ownerName ?? 'Unassigned'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: card.ownerColor ?? '#64748b' }}
        >
          {initials(card.ownerName)}
          <span className="sr-only">{card.ownerName ?? 'Unassigned'}</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{card.vehicleModel ?? 'No model'}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityDot priority={card.priority} score={card.score} />
        <span>Score {card.score}</span>
        <span className="ml-auto">{card.daysInStage}d in stage</span>
      </div>
    </>
  );
}

export function KanbanCard({
  card,
  draggable,
  dragging,
  onMove,
}: {
  card: PipelineCard;
  draggable: boolean;
  dragging?: boolean;
  /** Opens the keyboard "Move to…" menu (key M). */
  onMove: (card: PipelineCard) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: card.id,
    data: { card },
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`kanban-card-${card.id}`}
      data-stage={card.stage}
      aria-label={`${card.customerName}, ${card.vehicleModel ?? 'no model'}. Press M to move.`}
      onKeyDown={(e) => {
        if ((e.key === 'm' || e.key === 'M') && e.target === e.currentTarget) {
          e.preventDefault();
          onMove(card);
          return;
        }
        listeners?.onKeyDown?.(e as never);
      }}
      className={cn(
        'touch-manipulation rounded-md border border-border bg-card p-3 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        draggable && 'cursor-grab',
        dragging && 'opacity-40',
      )}
    >
      <CardBody card={card} />
    </div>
  );
}
