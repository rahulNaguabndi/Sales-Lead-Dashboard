export const ROLES = ['REP', 'MANAGER', 'VP'] as const;
export type Role = (typeof ROLES)[number];

export const ASSIGN_STRATEGIES = ['LOAD_BALANCED', 'LANGUAGE_MATCH', 'ROUND_ROBIN'] as const;
export type AssignStrategy = (typeof ASSIGN_STRATEGIES)[number];

export const LEAD_SOURCES = [
  'WEBSITE',
  'FACEBOOK',
  'INSTAGRAM',
  'GOOGLE_ADS',
  'PORTAL',
  'WALK_IN',
  'PHONE',
  'REFERRAL',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'TEST_DRIVE',
  'NEGOTIATION',
  'WON',
  'LOST',
  'COLD',
] as const;
export type Stage = (typeof STAGES)[number];

export const OPEN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION'] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];

export const PRIORITIES = ['HOT', 'WARM', 'COOL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACTIVITY_KINDS = ['USER', 'SYSTEM'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const USER_ACTIVITY_TYPES = [
  'CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'MEETING',
  'TEST_DRIVE',
  'NOTE',
] as const;
export type UserActivityType = (typeof USER_ACTIVITY_TYPES)[number];

export const SYSTEM_ACTIVITY_TYPES = [
  'LEAD_CREATED',
  'STAGE_CHANGED',
  'ASSIGNED',
  'CLAIMED',
  'FOLLOW_UP_SCHEDULED',
  'FOLLOW_UP_MISSED',
  'AUTO_COLD',
  'OFFER_APPLIED',
  'SCORE_CHANGED',
] as const;
export type SystemActivityType = (typeof SYSTEM_ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPES = [...USER_ACTIVITY_TYPES, ...SYSTEM_ACTIVITY_TYPES] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const OUTCOMES = [
  'CONNECTED',
  'NO_ANSWER',
  'VOICEMAIL',
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const CHANNELS = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'] as const;
export type Channel = (typeof CHANNELS)[number];

export const BEST_TIMES = ['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'] as const;
export type BestTime = (typeof BEST_TIMES)[number];

export const AGE_BANDS = ['18-25', '26-35', '36-45', '46-60', '60+', 'UNKNOWN'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const LOST_REASONS = [
  'PRICE',
  'BOUGHT_ELSEWHERE',
  'NOT_READY',
  'UNREACHABLE',
  'FINANCING_DECLINED',
  'OTHER',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const FOLLOW_UP_STATUSES = ['PENDING', 'DONE', 'MISSED', 'CANCELLED'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const DISCOUNT_TYPES = ['AMOUNT', 'PERCENT', 'APR', 'GIFT'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const LANGUAGES = ['de', 'fr', 'it', 'es', 'nl', 'pt', 'en', 'pl', 'da'] as const;
export type Language = (typeof LANGUAGES)[number];

export const TEAM_REGIONS = ['DACH', 'WEST', 'SOUTH'] as const;
export type TeamRegion = (typeof TEAM_REGIONS)[number];
