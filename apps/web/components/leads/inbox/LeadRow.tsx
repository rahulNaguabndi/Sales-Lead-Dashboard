'use client';

import { VEHICLES, type ActivityType } from '@leaddesk/shared';
import type { LeadListItem } from '@/server/services/lead-query';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { PriorityDot } from './PriorityDot';
import { formatAge, RelativeTime } from './RelativeTime';
import { SourceBadge } from './SourceBadge';
import { StageChip } from './StageChip';

const ACTIVITY_LABEL: Partial<Record<ActivityType, string>> = {
  CALL: 'Called',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Emailed',
  MEETING: 'Meeting',
  TEST_DRIVE: 'Test drive',
  NOTE: 'Note',
};

export const flagEmoji = (code: string) =>
  /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : '';

const vehicleName = (slug: string | null) =>
  slug ? (VEHICLES.find((v) => v.slug === slug)?.name ?? slug) : '—';

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function NextFollowUp({ at, overdue, now }: { at: number | null; overdue: boolean; now: number }) {
  if (at === null) return <span className="text-slate-500">—</span>;
  if (overdue)
    return (
      <span className="font-medium text-red-400">
        Overdue · <RelativeTime at={at} now={now} />
      </span>
    );
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now).toDateString() === d.toDateString();
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return <span suppressHydrationWarning>{today ? `Today ${time}` : `${day} ${time}`}</span>;
}

export function LeadRow({
  item,
  showOwner,
  highlighted,
  now,
  onOpen,
}: {
  item: LeadListItem;
  showOwner: boolean;
  highlighted: boolean;
  now: number;
  onOpen: (id: string) => void;
}) {
  const { customer, flags } = item;
  return (
    <tr
      tabIndex={0}
      data-lead-row
      data-lead-id={item.id}
      data-highlight={highlighted ? 'true' : undefined}
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(item.id);
      }}
      className={cn(
        'h-10 cursor-pointer border-b border-slate-800 hover:bg-slate-900 focus:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        highlighted && 'animate-pulse bg-blue-500/10',
      )}
    >
      <td className="w-8 pl-3">
        <PriorityDot priority={item.priority} score={item.score} />
      </td>
      <td className="max-w-[16rem] px-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium" title={customer.name}>
            {customer.name}
          </span>
          {customer.isReturning && (
            <span title="Returning customer" className="text-xs text-emerald-400">
              ↺<span className="sr-only">Returning customer</span>
            </span>
          )}
          <span className="shrink-0 text-xs text-slate-400" title={customer.country}>
            {flagEmoji(customer.country)} {customer.city ?? ''}
          </span>
          {flags.slaBreach && (
            <span className="shrink-0 rounded-full bg-red-500/20 px-1.5 text-xs text-red-300">
              Respond now
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 lg:hidden">
          <StageChip stage={item.stage} />
          <span>{vehicleName(item.vehicleModel)}</span>
        </div>
      </td>
      <td className="hidden px-2 lg:table-cell">{vehicleName(item.vehicleModel)}</td>
      <td className="hidden px-2 lg:table-cell">
        <SourceBadge source={item.source} />
      </td>
      <td className="hidden px-2 lg:table-cell">
        <StageChip stage={item.stage} />
      </td>
      {showOwner && (
        <td className="hidden px-2 lg:table-cell">
          {item.owner ? (
            <Avatar className="h-6 w-6 text-[10px]" title={item.owner.name}>
              <AvatarFallback style={{ backgroundColor: item.owner.avatarColor }}>
                {initials(item.owner.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="text-xs text-slate-500">Unassigned</span>
          )}
        </td>
      )}
      <td className="hidden whitespace-nowrap px-2 text-slate-400 lg:table-cell">
        {formatAge(item.createdAt, now)}
      </td>
      <td className="hidden max-w-[14rem] truncate px-2 lg:table-cell">
        {item.lastActivity ? (
          <span>
            {ACTIVITY_LABEL[item.lastActivity.type] ?? item.lastActivity.type} ·{' '}
            <RelativeTime at={item.lastActivity.at} now={now} />
          </span>
        ) : (
          <span className="italic text-slate-500">No activity yet</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 pr-3 text-right">
        <NextFollowUp at={item.nextFollowUpAt} overdue={flags.overdue} now={now} />
      </td>
    </tr>
  );
}
