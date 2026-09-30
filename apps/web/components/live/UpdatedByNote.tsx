'use client';

import type { LeadSlotProps } from '@/components/leads/detail/types';
import { useLiveState } from '@/lib/sse/useLiveEvents';

/** Header slot: "updated just now by …" note for changes made by colleagues on the open lead. */
export function UpdatedByNote({ lead, currentUser, permissions }: LeadSlotProps) {
  const { lastUpdatedBy } = useLiveState();
  const note = lastUpdatedBy.get(lead.id);
  const reassigned =
    lead.ownerId !== null && lead.ownerId !== currentUser.id && !permissions.canLogActivity;
  return (
    <div className="flex flex-col gap-1 text-xs">
      {note && (
        <span className="text-amber-400" data-testid="updated-by">
          Updated by {note.name} just now
        </span>
      )}
      {reassigned && (
        <span role="alert" className="text-red-400">
          This lead is now assigned to someone else; actions are disabled.
        </span>
      )}
    </div>
  );
}
