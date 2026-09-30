import type { ComponentType } from 'react';
import type { Role, Stage } from '@leaddesk/shared';
import { ActivityComposer } from '@/components/leads/composer';

/**
 * Slot registry for the lead detail page. The documented owner is F05; until F05 lands, F06
 * ships this minimal registry (same shape as the F05 contract) so the composer has a home.
 * Other features change only their own key. F05: keep the `composer` entry when merging.
 */
export type LeadSlotProps = {
  lead: { id: string; stage: Stage; version: number; ownerId: string | null };
  permissions?: { canLogActivity?: boolean };
  currentUser: { id: string; name: string; role: Role };
  [extra: string]: unknown;
};

export type LeadSlotName =
  'composer' | 'channels' | 'followUps' | 'offers' | 'ai' | 'customerExtras' | 'headerActions';

export const leadSlots: Record<LeadSlotName, ComponentType<LeadSlotProps> | null> = {
  composer: ActivityComposer as ComponentType<LeadSlotProps>,
  channels: null,
  followUps: null,
  offers: null,
  ai: null,
  customerExtras: null,
  headerActions: null,
};
