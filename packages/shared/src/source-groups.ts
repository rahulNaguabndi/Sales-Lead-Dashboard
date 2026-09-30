import type { LeadSource } from './enums';

export const SOURCE_GROUPS = [
  'WEBSITE',
  'SOCIAL',
  'PAID_SEARCH',
  'PORTALS',
  'OFFLINE',
  'REFERRAL',
] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

export const SOURCE_GROUP_OF: Record<LeadSource, SourceGroup> = {
  WEBSITE: 'WEBSITE',
  FACEBOOK: 'SOCIAL',
  INSTAGRAM: 'SOCIAL',
  GOOGLE_ADS: 'PAID_SEARCH',
  PORTAL: 'PORTALS',
  WALK_IN: 'OFFLINE',
  PHONE: 'OFFLINE',
  REFERRAL: 'REFERRAL',
};
