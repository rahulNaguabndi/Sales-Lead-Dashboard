'use client';

import { ArrowDownUp } from 'lucide-react';
import type { ActivityKindFilter, ActivityOrder } from '@/components/leads/detail/types';
import { Button } from '@/components/ui/button';

export const ORDER_STORAGE_KEY = 'leaddesk.timeline.order';

const FILTERS: { value: ActivityKindFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'USER', label: 'Activities' },
  { value: 'SYSTEM', label: 'System' },
];

export function TimelineControls({
  order,
  kind,
  onOrder,
  onKind,
}: {
  order: ActivityOrder;
  kind: ActivityKindFilter;
  onOrder: (o: ActivityOrder) => void;
  onKind: (k: ActivityKindFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Filter timeline" className="flex gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={kind === f.value ? 'secondary' : 'ghost'}
            aria-pressed={kind === f.value}
            onClick={() => onKind(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onOrder(order === 'desc' ? 'asc' : 'desc')}
      >
        <ArrowDownUp aria-hidden className="mr-1 h-3.5 w-3.5" />
        {order === 'desc' ? 'Newest first' : 'Oldest first'}
      </Button>
    </div>
  );
}
