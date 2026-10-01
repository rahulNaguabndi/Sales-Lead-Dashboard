'use client';

import { useQuery } from '@tanstack/react-query';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { fetchLeadFollowUps } from '@/components/followups/api';
import { ActivityComposer } from './ActivityComposer';

/**
 * The detail page's composer slot. It shares the follow-up card's query, so a pending follow-up
 * is offered as "Mark … as done" (pre-ticked when due or overdue) whenever the rep logs a touch.
 */
export function ComposerSlot({ lead, permissions, currentUser }: LeadSlotProps) {
  const followUps = useQuery({
    queryKey: ['leads', lead.id, 'follow-ups'],
    queryFn: () => fetchLeadFollowUps(lead.id),
  });
  const next = followUps.data?.items[0];
  return (
    <ActivityComposer
      // Remount when the pending follow-up changes so the checkbox default is recomputed.
      key={next?.id ?? 'none'}
      lead={lead}
      currentUser={currentUser}
      permissions={permissions}
      pendingFollowUp={next ? { id: next.id, note: next.note, dueAt: next.dueAt } : null}
    />
  );
}
