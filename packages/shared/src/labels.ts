import { VEHICLES } from './catalog';
import type {
  ActivityType,
  Channel,
  LeadSource,
  LostReason,
  Outcome,
  Priority,
  Role,
} from './enums';
import type { SourceGroup } from './source-groups';
import { STAGE_LABELS } from './stage-machine';

/**
 * The one label layer for user-facing enum values. Components must render these helpers,
 * never raw enum strings (see apps/web/tests/unit/no-raw-enums.test.ts).
 */

export const SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  GOOGLE_ADS: 'Google Ads',
  PORTAL: 'Portal',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  REFERRAL: 'Referral',
};

export const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  WEBSITE: 'Website',
  SOCIAL: 'Social',
  PAID_SEARCH: 'Paid search',
  PORTALS: 'Portals',
  OFFLINE: 'Walk-in & phone',
  REFERRAL: 'Referral',
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE: 'Price',
  BOUGHT_ELSEWHERE: 'Bought elsewhere',
  NOT_READY: 'Not ready to buy',
  UNREACHABLE: 'Unreachable',
  FINANCING_DECLINED: 'Financing declined',
  OTHER: 'Other',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  TEST_DRIVE: 'Test drive',
  NOTE: 'Note',
  LEAD_CREATED: 'Lead created',
  STAGE_CHANGED: 'Stage changed',
  ASSIGNED: 'Assigned',
  CLAIMED: 'Claimed',
  FOLLOW_UP_SCHEDULED: 'Follow-up scheduled',
  FOLLOW_UP_MISSED: 'Follow-up missed',
  AUTO_COLD: 'Went cold',
  OFFER_APPLIED: 'Offer applied',
  SCORE_CHANGED: 'Score changed',
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  VOICEMAIL: 'Voicemail',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CALLBACK_REQUESTED: 'Callback requested',
};

export const PRIORITY_LABELS: Record<Priority, string> = { HOT: 'Hot', WARM: 'Warm', COOL: 'Cool' };

export const ROLE_LABELS: Record<Role, string> = { REP: 'Rep', MANAGER: 'Manager', VP: 'VP' };

/** Unknown values fall back to sentence case so a new enum never renders as SHOUTING_SNAKE. */
export const humanize = (v: string): string =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' ') : v;

const pick =
  <K extends string>(map: Record<K, string>) =>
  (v: string | null | undefined): string =>
    v == null ? '—' : (map[v as K] ?? humanize(v));

export const sourceLabel = pick(SOURCE_LABELS);
export const sourceGroupLabel = pick(SOURCE_GROUP_LABELS);
export const stageLabel = pick(STAGE_LABELS);
export const lostReasonLabel = pick(LOST_REASON_LABELS);
export const channelLabel = pick(CHANNEL_LABELS);
export const activityTypeLabel = pick(ACTIVITY_TYPE_LABELS);
export const outcomeLabel = pick(OUTCOME_LABELS);
export const priorityLabel = pick(PRIORITY_LABELS);
export const roleLabel = pick(ROLE_LABELS);

/** Vehicle slug → catalog name. Missing model is always "—" (one placeholder everywhere). */
export function vehicleName(slug: string | null | undefined): string {
  if (!slug) return '—';
  return VEHICLES.find((v) => v.slug === slug)?.name ?? humanize(slug.replace(/-/g, '_'));
}

/** Spoken-language code ("en") → display code ("EN"). Never a country flag. */
export const languageLabel = (code: string): string => code.toUpperCase();
