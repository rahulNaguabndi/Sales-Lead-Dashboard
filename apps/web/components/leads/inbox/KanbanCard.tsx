'use client';

import { VEHICLES } from '@leaddesk/shared';
import type { LeadListItem } from '@/server/services/lead-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { ClaimButton } from '@/components/leads/assign/ClaimButton';
import { PriorityDot } from './PriorityDot';
import { SourceBadge } from './SourceBadge';
import { flagEmoji } from './LeadRow';
import { RelativeTime } from './RelativeTime';

const vehicleName = (slug: string | null) =>
  slug ? (VEHICLES.find((v) => v.slug === slug)?.name ?? slug) : null;

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function NextFollowUp({ at, overdue, now }: { at: number | null; overdue: boolean; now: number }) {
  if (at === null) return null;
  if (overdue)
    return (
      <span className="text-xs font-medium text-red-400">
        Overdue · <RelativeTime at={at} now={now} />
      </span>
    );
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now).toDateString() === d.toDateString();
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <span className="text-xs text-slate-400" suppressHydrationWarning>
      {today ? `Today ${time}` : `${day} ${time}`}
    </span>
  );
}

export function KanbanCard({
  item,
  now,
  highlighted,
  onOpen,
}: {
  item: LeadListItem;
  now: number;
  highlighted: boolean;
  onOpen: (id: string) => void;
}) {
  const { customer, flags } = item;
  const vehicle = vehicleName(item.vehicleModel);

  return (
    <div
      tabIndex={0}
      data-lead-id={item.id}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(item.id);
      }}
      className={cn(
        'cursor-pointer rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm hover:border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        highlighted && 'animate-pulse bg-blue-500/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <PriorityDot priority={item.priority} score={item.score} />
          <span className="truncate font-medium text-slate-100" title={customer.name}>
            {customer.name}
          </span>
          {customer.isReturning && (
            <span title="Returning customer" className="shrink-0 text-xs text-emerald-400">
              ↺
            </span>
          )}
        </div>
        {item.owner ? (
          <Avatar className="h-6 w-6 shrink-0 text-[10px]" title={item.owner.name}>
            <AvatarFallback style={{ backgroundColor: item.owner.avatarColor }}>
              {initials(item.owner.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <ClaimButton leadId={item.id} />
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
        <span>{flagEmoji(customer.country)}</span>
        {customer.city && <span>{customer.city}</span>}
      </div>

      {vehicle && <div className="mt-1 truncate text-xs text-slate-400">{vehicle}</div>}

      <div className="mt-2 flex items-center justify-between gap-2">
        <SourceBadge source={item.source} />
        <NextFollowUp at={item.nextFollowUpAt} overdue={flags.overdue} now={now} />
      </div>

      {flags.slaBreach && (
        <div className="mt-1.5 rounded-full bg-red-500/20 px-2 py-0.5 text-center text-xs text-red-300">
          Respond now
        </div>
      )}
    </div>
  );
}
