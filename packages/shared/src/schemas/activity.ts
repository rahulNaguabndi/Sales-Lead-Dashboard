import { z } from 'zod';
import {
  OPEN_STAGES,
  OUTCOMES,
  USER_ACTIVITY_TYPES,
  type Priority,
  type Stage,
  type UserActivityType,
} from '../enums';
import type { ActivityDTO } from '../events';

/** Types that represent customer contact and therefore require an outcome (FR-002). */
export const OUTCOME_REQUIRED_TYPES: readonly UserActivityType[] = [
  'CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
];

export const NOTE_MAX_LENGTH = 2000;
export const FOLLOW_UP_NOTE_MAX_LENGTH = 200;
export const FOLLOW_UP_MIN_LEAD_MS = 60_000;
export const FOLLOW_UP_MAX_LEAD_MS = 90 * 86_400_000;
export const IDEMPOTENCY_WINDOW_MS = 10 * 60_000;

export const ACTIVITY_ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  staleLead: 'STALE_LEAD',
  invalidTransition: 'INVALID_TRANSITION',
  invalidFollowUp: 'INVALID_FOLLOW_UP',
} as const;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
// Control characters other than \n (0x0A) and \t (0x09), plus DEL.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** Removes control characters except newline and tab. */
export function stripControlChars(value: string): string {
  return value.replace(CONTROL_RE, '');
}

/**
 * Builds the activity schema. `now` is injectable so the follow-up window is testable; the
 * client and the server both use the default instance (FR-012: one shared definition).
 */
export function createActivitySchema(now: () => number = Date.now) {
  return z
    .object({
      clientRequestId: z.string().regex(ULID_RE, 'Invalid request id'),
      type: z.enum(USER_ACTIVITY_TYPES),
      outcome: z.enum(OUTCOMES).optional(),
      note: z
        .string()
        .transform(stripControlChars)
        .pipe(
          z
            .string()
            .trim()
            .min(1, 'Note is required')
            .max(NOTE_MAX_LENGTH, `Note must be at most ${NOTE_MAX_LENGTH} characters`),
        ),
      aiAssisted: z.boolean().default(false),
      nextFollowUp: z
        .object({
          dueAt: z.string().datetime(),
          note: z
            .string()
            .trim()
            .max(FOLLOW_UP_NOTE_MAX_LENGTH, `At most ${FOLLOW_UP_NOTE_MAX_LENGTH} characters`)
            .optional(),
        })
        .optional(),
      completeFollowUpId: z.string().min(1).optional(),
      stageChange: z.object({ to: z.enum(OPEN_STAGES) }).optional(),
      expectedVersion: z.number().int().optional(),
    })
    .superRefine((v, ctx) => {
      if (v.type === 'NOTE' && v.outcome !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['outcome'],
          message: 'A note cannot have an outcome',
        });
      }
      if (OUTCOME_REQUIRED_TYPES.includes(v.type) && v.outcome === undefined) {
        ctx.addIssue({ code: 'custom', path: ['outcome'], message: 'Outcome is required' });
      }
      if (v.nextFollowUp) {
        const due = Date.parse(v.nextFollowUp.dueAt);
        const t = now();
        if (due < t + FOLLOW_UP_MIN_LEAD_MS) {
          ctx.addIssue({
            code: 'custom',
            path: ['nextFollowUp', 'dueAt'],
            message: 'Follow-up must be at least 1 minute in the future',
          });
        } else if (due > t + FOLLOW_UP_MAX_LEAD_MS) {
          ctx.addIssue({
            code: 'custom',
            path: ['nextFollowUp', 'dueAt'],
            message: 'Follow-up must be within 90 days',
          });
        }
      }
    });
}

export const CreateActivitySchema = createActivitySchema();

export type CreateActivity = z.infer<typeof CreateActivitySchema>;
/** Input shape (before defaults/transforms), as a client sends it. */
export type CreateActivityInput = z.input<typeof CreateActivitySchema>;

export type ActivityActorDTO = { id: string; name: string; avatarColor: string };

export type ActivityResponseDTO = ActivityDTO & { actor: ActivityActorDTO | null };

export type CreateActivityResponse = {
  activity: ActivityResponseDTO;
  systemActivities: ActivityResponseDTO[];
  lead: {
    id: string;
    stage: Stage;
    score: number;
    priority: Priority;
    scoreBreakdown: Record<string, number>;
    attemptCount: number;
    firstResponseAt: number | null;
    lastActivityAt: number | null;
    lastContactAt: number | null;
    version: number;
  };
  followUp: { id: string; dueAt: number; status: string; assignedTo: string } | null;
};
