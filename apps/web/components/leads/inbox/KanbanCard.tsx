'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { vehicleName } from '@leaddesk/shared';
import type { LeadListItem } from '@/server/services/lead-query';
import { CountryCode, UserAvatar } from '@/components/ui/user-avatar';
import { cn } from '@/lib/utils';
import { ClaimButton } from '@/components/leads/assign/ClaimButton';
import { AssignCombobox } from '@/components/leads/assign/AssignCombobox';
import { PriorityDot } from './PriorityDot';
import { SourceBadge } from './SourceBadge';
import { DuplicateBadge, NextFollowUp } from './LeadRow';

/**
 * A board card is a real link (stretched over the card): keyboard reachable, announced as a link,
 * and opens in a new tab with Ctrl/⌘-click. Claim/assign controls sit above the link layer.
 */
export function KanbanCard({
  item,
  now,
  highlighted,
  canAssign,
}: {
  item: LeadListItem;
  now: number;
  highlighted: boolean;
  canAssign?: boolean;
}) {
  const { customer, flags } = item;
  const [opening, setOpening] = useState(false);
  const vehicle = item.vehicleModel ? vehicleName(item.vehicleModel) : null;

  return (
    <div
      data-lead-id={item.id}
      aria-busy={opening || undefined}
      className={cn(
        'relative rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm hover:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500',
        highlighted && 'animate-pulse bg-blue-500/10',
        opening && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <PriorityDot priority={item.priority} score={item.score} />
          <Link
            href={`/leads/${item.id}`}
            className="truncate font-medium text-slate-100 after:absolute after:inset-0 after:rounded-lg focus:outline-none"
            title={customer.name}
            onClick={(e) => {
              if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) setOpening(true);
            }}
          >
            {customer.name}
          </Link>
          {customer.isReturning && (
            <span title="Returning customer" className="shrink-0 text-emerald-400">
              <RotateCcw aria-hidden className="h-3 w-3" />
              <span className="sr-only">Returning customer</span>
            </span>
          )}
        </div>
        <div className="relative z-10 shrink-0">
          {item.owner ? (
            canAssign && item.teamId ? (
              <AssignCombobox
                teamId={item.teamId}
                leadId={item.id}
                currentOwnerId={item.owner.id}
                trigger={
                  <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={`Owner ${item.owner.name}. Reassign ${customer.name}`}
                  >
                    <UserAvatar name={item.owner.name} color={item.owner.avatarColor} />
                  </button>
                }
              />
            ) : (
              <UserAvatar name={item.owner.name} color={item.owner.avatarColor} />
            )
          ) : // Leaders hand pool leads out; reps claim them.
          canAssign && item.teamId ? (
            <AssignCombobox
              teamId={item.teamId}
              leadId={item.id}
              currentOwnerId={null}
              label="Assign"
            />
          ) : (
            <ClaimButton leadId={item.id} customerName={customer.name} />
          )}
        </div>
      </div>

      {opening && <p className="mt-0.5 text-xs text-slate-400">Opening…</p>}

      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        <CountryCode code={customer.country} />
        {customer.city && <span className="truncate">{customer.city}</span>}
      </div>

      {vehicle && <div className="mt-1 truncate text-xs text-slate-400">{vehicle}</div>}
      {customer.openLeads > 1 && (
        <div className="mt-1">
          <DuplicateBadge count={customer.openLeads} />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
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
