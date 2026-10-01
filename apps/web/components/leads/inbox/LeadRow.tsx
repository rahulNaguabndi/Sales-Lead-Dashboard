'use client';

import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { activityTypeLabel, vehicleName, type ActivityType } from '@leaddesk/shared';
import type { LeadListItem } from '@/server/services/lead-query';
import { CountryCode, UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { formatDate, localTimeZone } from '@/lib/format';
import { ClaimButton } from '@/components/leads/assign/ClaimButton';
import { PriorityDot } from './PriorityDot';
import { formatAge, RelativeTime } from './RelativeTime';
import { SourceBadge } from './SourceBadge';
import { StageChip } from './StageChip';

const ACTIVITY_LABEL: Partial<Record<ActivityType, string>> = {
  CALL: 'Called',
  EMAIL: 'Emailed',
};

export const lastActivityLabel = (type: ActivityType) =>
  ACTIVITY_LABEL[type] ?? activityTypeLabel(type);

export function NextFollowUp({
  at,
  overdue,
  now,
}: {
  at: number | null;
  overdue: boolean;
  now: number;
}) {
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
  const day = formatDate(at, { year: false, timeZone: localTimeZone() });
  return <span suppressHydrationWarning>{today ? `Today ${time}` : `${day} ${time}`}</span>;
}

/** Same customer, several open leads: two reps may be working the same person. */
export function DuplicateBadge({ count }: { count: number }) {
  return (
    <span
      className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-xs text-amber-400"
      title={`This customer has ${count} open leads. Coordinate before contacting them.`}
    >
      {count} open leads
    </span>
  );
}

export function LeadRow({
  item,
  showOwner,
  highlighted,
  now,
  pending,
  selectable,
  selected,
  onToggleSelect,
  onOpen,
}: {
  item: LeadListItem;
  showOwner: boolean;
  highlighted: boolean;
  now: number;
  /** Navigation to this lead has started (shows a loading state on the row). */
  pending?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { customer, flags } = item;
  const href = `/leads/${item.id}`;
  return (
    <tr
      tabIndex={0}
      data-lead-row
      data-lead-id={item.id}
      data-highlight={highlighted ? 'true' : undefined}
      aria-busy={pending || undefined}
      onClick={(e) => {
        // Modifier clicks belong to the name link (new tab); plain clicks open the lead.
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        onOpen(item.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') onOpen(item.id);
        if (e.key === ' ' && selectable) {
          e.preventDefault();
          onToggleSelect?.(item.id);
        }
        if ((e.key === 'c' || e.key === 'C') && !item.owner) {
          e.currentTarget.querySelector<HTMLButtonElement>('[data-testid="claim-button"]')?.click();
        }
      }}
      className={cn(
        'h-11 cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-800/60 focus:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        highlighted && 'animate-pulse bg-blue-500/10',
        selected && 'bg-blue-500/10',
        pending && 'opacity-60',
      )}
    >
      {selectable && (
        <td className="w-8 pl-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect?.(item.id)}
            aria-label={`Select ${customer.name}`}
            data-testid="row-select"
            className="h-4 w-4 accent-blue-600"
          />
        </td>
      )}
      <td className="w-8 pl-3">
        <PriorityDot priority={item.priority} score={item.score} />
      </td>
      <td className="max-w-[16rem] px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={href}
            className="min-w-0 truncate font-medium hover:underline"
            title={customer.name}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            {customer.name}
          </Link>
          {pending && <span className="shrink-0 text-xs text-slate-400">Opening…</span>}
          {customer.isReturning && (
            <span title="Returning customer" className="shrink-0 text-emerald-400">
              <RotateCcw aria-hidden className="h-3 w-3" />
              <span className="sr-only">Returning customer</span>
            </span>
          )}
          <span className="hidden shrink-0 items-center gap-1 text-xs text-slate-400 sm:inline-flex">
            <CountryCode code={customer.country} /> {customer.city ?? ''}
          </span>
          {customer.openLeads > 1 && <DuplicateBadge count={customer.openLeads} />}
          {flags.slaBreach && (
            <span className="shrink-0 rounded-full bg-red-500/20 px-1.5 text-xs text-red-300">
              Respond now
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 lg:hidden">
          <StageChip stage={item.stage} />
          <span className="truncate">{vehicleName(item.vehicleModel)}</span>
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
            <UserAvatar name={item.owner.name} color={item.owner.avatarColor} showName />
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
            {lastActivityLabel(item.lastActivity.type)} ·{' '}
            <RelativeTime at={item.lastActivity.at} now={now} />
          </span>
        ) : (
          <span className="italic text-slate-500">No activity yet</span>
        )}
      </td>
      <td className="whitespace-nowrap px-2 pr-3 text-right">
        {!item.owner && <ClaimButton leadId={item.id} customerName={customer.name} />}
        <NextFollowUp at={item.nextFollowUpAt} overdue={flags.overdue} now={now} />
      </td>
    </tr>
  );
}
