'use client';

import type { LeadSlotProps } from '@/components/leads/detail/types';
import { AssignCombobox } from './AssignCombobox';
import { ClaimButton } from './ClaimButton';

/** `headerActions` slot registration: Claim for pool leads, "Assign to…" for managers and VPs. */
export function LeadHeaderAssign({ lead, customer, permissions }: LeadSlotProps) {
  const pool = lead.ownerId === null;
  if (!(pool && permissions.canClaim) && !permissions.canAssign) return null;
  return (
    <div className="flex items-center gap-2">
      {pool && permissions.canClaim && <ClaimButton leadId={lead.id} size="sm" />}
      {permissions.canAssign && (
        <AssignCombobox
          teamId={lead.teamId}
          leadId={lead.id}
          version={lead.version}
          customerLanguage={customer.language}
        />
      )}
    </div>
  );
}
