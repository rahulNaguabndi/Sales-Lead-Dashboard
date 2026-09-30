import type { ComponentType } from 'react';
import type { LeadSlotProps } from './types';
import { ActivityComposer } from '@/components/leads/composer';
import { UpdatedByNote } from '@/components/live/UpdatedByNote';
import { FollowUpCard } from '@/components/followups/followup-card';

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
  channels: null,
  followUps: FollowUpCard as ComponentType<LeadSlotProps>,
  offers: null,
  ai: null,
  customerExtras: null,
  headerActions: null,
  liveNote: UpdatedByNote as ComponentType<LeadSlotProps>,
};
