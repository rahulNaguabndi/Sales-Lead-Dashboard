import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { STAGE_COLORS } from '@/components/ui/tokens';
import { ScoreBadge } from '@/components/leads/score';
import { formatDateTime } from '@/lib/format';
import type { LeadDetail } from './types';

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export function LeadHeader({ detail, actions }: { detail: LeadDetail; actions?: ReactNode }) {
  const { lead, customer, owner } = detail;
  return (
    <header className="space-y-2 border-b border-border pb-4">
      <Link
        href="/inbox"
        className="inline-flex items-center text-xs text-muted-foreground hover:underline"
      >
        <ChevronLeft aria-hidden className="h-3 w-3" />
        Back to inbox
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {customer.firstName} {customer.lastName}
        </h1>
        <span className="text-sm text-muted-foreground">{lead.reference}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[lead.stage]}`}
        >
          {label(lead.stage)}
        </span>
        <ScoreBadge
          score={lead.score}
          priority={lead.priority}
          breakdown={lead.scoreBreakdown}
          updatedAt={lead.updatedAt}
        />
        {customer.isReturning && (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
            Returning
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      <p className="text-sm text-muted-foreground">
        Owner:{' '}
        {owner ? `${owner.name}${owner.isActive ? '' : ' (inactive)'}` : 'Unassigned'} · Source:{' '}
        {label(lead.source)}
        {lead.sourceDetail ? ` (${lead.sourceDetail})` : ''} · Created{' '}
        <time dateTime={new Date(lead.createdAt).toISOString()}>{formatDateTime(lead.createdAt)}</time>
      </p>
    </header>
  );
}
