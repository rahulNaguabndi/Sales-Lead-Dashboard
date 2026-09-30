import type { LeadDeskEvent } from '@leaddesk/shared';

export type UpdatedByState = { note: boolean; reassignedAway: boolean };

/** What the open lead detail should show for an event (FR-013). */
export function updatedByFor(e: LeadDeskEvent, openLeadId: string, me: string): UpdatedByState {
  const none = { note: false, reassignedAway: false };
  if (e.type === 'offer.changed' || e.type === 'followup.due' || e.type === 'lead.created')
    return none;
  if (e.leadId !== openLeadId || e.by === me) return none;
  if (e.type === 'lead.assigned' && e.fromOwnerId === me && e.toOwnerId !== me)
    return { note: true, reassignedAway: true };
  return { note: true, reassignedAway: false };
}
