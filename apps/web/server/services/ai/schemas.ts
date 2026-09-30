import { z } from 'zod';
import { z as z4 } from 'zod/v4';

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

// The SDK's structured-output helper needs zod v4 schemas (shipped inside zod 3.25 as `zod/v4`).
const ChannelEnum = z4.enum(['CALL', 'WHATSAPP', 'SMS', 'EMAIL']);
const DraftChannelEnum = z4.enum(['WHATSAPP', 'SMS', 'EMAIL']);

export const SuggestSchema = z4.object({
  summary: z4.string().max(600),
  nextBestAction: z4.object({
    action: z4.enum(ACTIONS),
    channel: ChannelEnum.nullable(),
    timing: z4.string().max(80),
    reason: z4.string().max(300),
    offerId: z4.string().nullable(),
  }),
  confidence: z4.enum(['low', 'medium', 'high']),
});
export type SuggestOutput = z4.infer<typeof SuggestSchema>;

export const DraftSchema = z4.object({
  channel: DraftChannelEnum,
  language: z4.string().length(2),
  subject: z4.string().max(120).nullable(),
  body: z4.string().max(1000),
  offerId: z4.string().nullable(),
});
export type DraftOutput = z4.infer<typeof DraftSchema>;

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
  .object({ channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL']), regenerate: z.boolean().optional() })
  .strict();
export const FeedbackBodySchema = z
  .object({
    kind: z.enum(['suggest', 'draft']),
    fingerprint: z.string().min(1).max(100),
    vote: z.enum(['up', 'down']),
  })
  .strict();
