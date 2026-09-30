import type { ComponentType } from 'react';
import Link from 'next/link';
import type { LeadSlotProps } from './types';
import { ActivityComposer } from '@/components/leads/composer';
import { LeadHeaderAssign } from '@/components/leads/assign/LeadHeaderAssign';
import { UpdatedByNote } from '@/components/live/UpdatedByNote';
import { FollowUpCard } from '@/components/followups/followup-card';
import { ChannelBar } from '@/components/leads/channels/ChannelBar';
import { CustomerExtras } from '@/components/leads/customer/CustomerExtras';
import { OffersPanel } from '@/components/offers/OffersPanel';
import { StageSelect } from '@/components/leads/stage/StageSelect';

/** `headerActions` is shared: F07 stage select + F11 claim/assign. */
function HeaderActions(props: LeadSlotProps) {
  return (
    <div className="flex items-center gap-2">
      <StageSelect {...props} />
      <LeadHeaderAssign {...props} />
      {(['MANAGER', 'VP'] as string[]).includes(props.currentUser.role) && (
        <Link
          href={`/audit?entity=lead&entityId=${props.lead.id}`}
          className="text-sm underline"
          data-testid="audit-trail-link"
        >
          Audit trail
        </Link>
      )}
    </div>
  );
}

export type LeadSlotName =
  | 'composer'
  | 'channels'
  | 'followUps'
  | 'offers'
  | 'ai'
  | 'customerExtras'
  | 'headerActions'
  | 'liveNote';

export type LeadSlots = Record<LeadSlotName, ComponentType<LeadSlotProps> | null>;

/**
 * Extension points of the lead detail page. Later features register a component by replacing
 * ONLY their own key (F06 composer, F14 channels + customerExtras, F08 followUps, F15 offers,
 * F18 ai, F07/F11 headerActions). Null renders nothing.
 */
export const leadSlots: LeadSlots = {
  composer: ActivityComposer as ComponentType<LeadSlotProps>,
  channels: ChannelBar as ComponentType<LeadSlotProps>,
  followUps: FollowUpCard as ComponentType<LeadSlotProps>,
  offers: OffersPanel as ComponentType<LeadSlotProps>,
  ai: null,
  customerExtras: CustomerExtras as ComponentType<LeadSlotProps>,
  headerActions: HeaderActions as ComponentType<LeadSlotProps>,
  liveNote: UpdatedByNote as ComponentType<LeadSlotProps>,
};
