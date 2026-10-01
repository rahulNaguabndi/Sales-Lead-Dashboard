'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import type { PipelineCard } from '@/server/services/stage';
import { priorityLabel, vehicleName } from '@leaddesk/shared';
import { PriorityDot } from '@/components/leads/inbox/PriorityDot';
import { UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';

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
        {card.ownerName ? (
          <UserAvatar name={card.ownerName} color={card.ownerColor ?? '#64748b'} />
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{vehicleName(card.vehicleModel)}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityDot priority={card.priority} decorative />
        <span>
          {priorityLabel(card.priority)} · {card.score}
        </span>
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
      aria-label={`${card.customerName}, ${vehicleName(card.vehicleModel)}. Press M to move.`}
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
