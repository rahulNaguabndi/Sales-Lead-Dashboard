import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ScoreBadge } from '@/components/leads/score';
import { formatDateTime } from '@/lib/format';
import type { LeadDetail } from './types';

import { OPEN_STAGES, sourceLabel } from '@leaddesk/shared';

export function LeadHeader({ detail, actions }: { detail: LeadDetail; actions?: ReactNode }) {
  const { lead, customer, owner } = detail;
  const otherOpen = detail.history.previousLeads.filter((p) =>
    (OPEN_STAGES as readonly string[]).includes(p.stage),
  );
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
        {/* The stage chip lives in the header actions (F07 StageSelect); one place only. */}
        <ScoreBadge
          score={lead.score}
          priority={lead.priority}
          breakdown={lead.scoreBreakdown}
          updatedAt={lead.updatedAt}
        />
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {otherOpen.length > 0 && (
        <p
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
          data-testid="duplicate-lead-note"
        >
          This customer has {otherOpen.length} other open lead{otherOpen.length === 1 ? '' : 's'} (
          {otherOpen.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              {p.canView ? (
                <Link href={`/leads/${p.id}`} className="underline">
                  {p.reference}
                </Link>
              ) : (
                p.reference
              )}
            </span>
          ))}
          ). Coordinate before contacting them so two reps don&apos;t work the same person.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Owner: {owner ? `${owner.name}${owner.isActive ? '' : ' (inactive)'}` : 'Unassigned'} ·
        Source: {sourceLabel(lead.source)}
        {lead.sourceDetail ? ` (${lead.sourceDetail})` : ''} · Created{' '}
        <time dateTime={new Date(lead.createdAt).toISOString()}>
          {formatDateTime(lead.createdAt)}
        </time>
      </p>
    </header>
  );
}
