import { z } from 'zod';

export const ACTIONS = [
  'CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'SCHEDULE_TEST_DRIVE',
  'SEND_OFFER',
  'ESCALATE_TO_MANAGER',
  'WAIT',
] as const;
export type AiAction = (typeof ACTIONS)[number];

const ChannelEnum = z.enum(['CALL', 'WHATSAPP', 'SMS', 'EMAIL']);
const DraftChannelEnum = z.enum(['WHATSAPP', 'SMS', 'EMAIL']);

export const SuggestSchema = z.object({
  summary: z.string().max(600),
  nextBestAction: z.object({
    action: z.enum(ACTIONS),
    channel: ChannelEnum.nullable(),
    timing: z.string().max(80),
    reason: z.string().max(300),
    offerId: z.string().nullable(),
  }),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type SuggestOutput = z.infer<typeof SuggestSchema>;

export const DraftSchema = z.object({
  channel: DraftChannelEnum,
  language: z.string().length(2),
  subject: z.string().max(120).nullable(),
  body: z.string().max(1000),
  offerId: z.string().nullable(),
});
export type DraftOutput = z.infer<typeof DraftSchema>;

export type FallbackReason =
  | 'NO_API_KEY'
  | 'TIMEOUT'
  | 'API_ERROR'
  | 'REFUSAL'
  | 'MAX_TOKENS'
  | 'INVALID_OUTPUT'
  | 'RATE_LIMITED';

type Meta = {
  source: 'AI' | 'RULES';
  model?: string;
  cached: boolean;
  generatedAt: number;
  fingerprint: string;
  fallbackReason?: FallbackReason;
  /** Minutes until the hourly limit resets (RATE_LIMITED only). */
  retryAfterMinutes?: number;
};

export type SuggestResponse = Meta & SuggestOutput;
export type DraftResponse = Meta & {
  draft: DraftOutput;
  /** Set when a rule-based template fell back to English for an unsupported language. */
  templateLanguage?: string;
};

export const SuggestBodySchema = z.object({ regenerate: z.boolean().optional() }).strict();
export const DraftBodySchema = z
  .object({ channel: DraftChannelEnum, regenerate: z.boolean().optional() })
  .strict();
export const FeedbackBodySchema = z
  .object({
    kind: z.enum(['suggest', 'draft']),
    fingerprint: z.string().min(1).max(100),
    vote: z.enum(['up', 'down']),
  })
  .strict();
