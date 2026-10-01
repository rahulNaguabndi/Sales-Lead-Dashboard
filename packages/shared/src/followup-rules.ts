import { z } from 'zod';
import { OPEN_STAGES, type Channel, type Stage } from './enums';

/** F08 rules: pure, time-injected, env-overridable (FR-007). */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const AT_RISK_DAYS = 3;
export const COLD_AFTER_DAYS = 7;
export const COLD_AFTER_UNANSWERED = 3;
export const MISSED_AFTER_HOURS = 24;
export const DUE_SOON_MINUTES = 5;
export const FOLLOW_UP_PAST_TOLERANCE_MS = 60_000;
export const FOLLOW_UP_MAX_AHEAD_MS = 90 * DAY_MS;

export type CadenceChannel = Channel | 'PREFERRED';
export const CADENCE: readonly { day: number; channel: CadenceChannel }[] = [
  { day: 0, channel: 'CALL' },
  { day: 1, channel: 'PREFERRED' },
  { day: 3, channel: 'CALL' },
  { day: 7, channel: 'EMAIL' },
  { day: 14, channel: 'PREFERRED' },
];

export type FollowUpRuleConfig = {
  atRiskDays: number;
  coldAfterDays: number;
  coldAfterUnanswered: number;
  missedAfterHours: number;
};

function positive(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Reads the demo overrides (fractions allowed, e.g. COLD_AFTER_DAYS=0.01). */
export function ruleConfigFromEnv(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): FollowUpRuleConfig {
  return {
    atRiskDays: positive(env.AT_RISK_DAYS, AT_RISK_DAYS),
    coldAfterDays: positive(env.COLD_AFTER_DAYS, COLD_AFTER_DAYS),
    coldAfterUnanswered: positive(env.COLD_AFTER_UNANSWERED, COLD_AFTER_UNANSWERED),
    missedAfterHours: positive(env.MISSED_AFTER_HOURS, MISSED_AFTER_HOURS),
  };
}

export const DEFAULT_RULE_CONFIG: FollowUpRuleConfig = {
  atRiskDays: AT_RISK_DAYS,
  coldAfterDays: COLD_AFTER_DAYS,
  coldAfterUnanswered: COLD_AFTER_UNANSWERED,
  missedAfterHours: MISSED_AFTER_HOURS,
};

export type RuleLead = {
  stage: Stage;
  lastContactAt: number | null;
  createdAt: number;
  attemptCount: number;
};

const isOpen = (stage: Stage) => (OPEN_STAGES as readonly Stage[]).includes(stage);

/** Time the lead has gone without a contact activity; NEW leads count from creation. */
export function idleMs(lead: Pick<RuleLead, 'lastContactAt' | 'createdAt'>, now: number): number {
  return Math.max(0, now - (lead.lastContactAt ?? lead.createdAt));
}

export function idleDays(lead: Pick<RuleLead, 'lastContactAt' | 'createdAt'>, now: number): number {
  return Math.floor(idleMs(lead, now) / DAY_MS);
}

export function isAtRisk(
  lead: RuleLead,
  now: number,
  cfg: FollowUpRuleConfig = DEFAULT_RULE_CONFIG,
): boolean {
  return isOpen(lead.stage) && idleMs(lead, now) >= cfg.atRiskDays * DAY_MS;
}

export type ColdDecision =
  | { cold: true; reason: 'No activity 7 days' | '3 unanswered attempts' }
  | { cold: false; reason: null };

/** Unanswered rule wins and ignores future follow-ups; the idle rule is protected by one. */
export function shouldAutoCold(
  lead: RuleLead,
  hasFutureFollowUp: boolean,
  now: number,
  cfg: FollowUpRuleConfig = DEFAULT_RULE_CONFIG,
): ColdDecision {
  if (!isOpen(lead.stage)) return { cold: false, reason: null };
  if (lead.attemptCount >= cfg.coldAfterUnanswered) {
    return { cold: true, reason: '3 unanswered attempts' };
  }
  if (!hasFutureFollowUp && idleMs(lead, now) >= cfg.coldAfterDays * DAY_MS) {
    return { cold: true, reason: 'No activity 7 days' };
  }
  return { cold: false, reason: null };
}

export function isMissed(
  dueAt: number,
  now: number,
  cfg: FollowUpRuleConfig = DEFAULT_RULE_CONFIG,
): boolean {
  return dueAt < now - cfg.missedAfterHours * HOUR_MS;
}

/* ------------------------------------------------------------------ cadence */

export type CadenceGuidance = {
  attempt: number;
  total: number;
  channel: Channel;
  dayOffset: number;
  label: string;
  done: boolean;
};

const CHANNEL_LABEL: Record<Channel, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};

export const cadence = {
  /** `priorAttempts` = outreach attempts already made (contact activities). */
  next(input: { priorAttempts: number; preferredChannel: Channel }): CadenceGuidance {
    const total = CADENCE.length;
    const index = Math.min(Math.max(0, input.priorAttempts), total - 1);
    const step = CADENCE[index]!;
    const channel: Channel =
      step.channel === 'PREFERRED'
        ? input.preferredChannel === 'CALL'
          ? 'WHATSAPP'
          : input.preferredChannel
        : step.channel;
    const done = input.priorAttempts >= total;
    const attempt = index + 1;
    return {
      attempt,
      total,
      channel,
      dayOffset: step.day,
      done,
      label: done
        ? `Cadence finished · all ${total} attempts made. Mark the follow-up done or move the lead on.`
        : `Attempt ${attempt} of ${total} · Suggested: ${CHANNEL_LABEL[channel]} today`,
    };
  },
};

/** Suggested callback: next day at the customer's best_time ("HH:MM", or a named window). */
export function suggestCallbackTime(now: Date, bestTime: string | null | undefined): Date {
  const named: Record<string, [number, number]> = {
    morning: [10, 0],
    afternoon: [15, 0],
    evening: [18, 0],
  };
  let h = 10;
  let m = 0;
  const t = (bestTime ?? '').trim().toLowerCase();
  const hm = /^(\d{1,2}):(\d{2})/.exec(t);
  if (hm) {
    h = Math.min(23, Number(hm[1]));
    m = Math.min(59, Number(hm[2]));
  } else {
    const key = Object.keys(named).find((k) => t.includes(k));
    if (key) [h, m] = named[key]!;
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m, 0, 0);
  return d;
}

/* ------------------------------------------------------------------ schemas */

export const FOLLOW_UP_VIEWS = ['today', 'overdue', 'upcoming'] as const;
export type FollowUpView = (typeof FOLLOW_UP_VIEWS)[number];

export const FOLLOW_UP_NOTE_MAX = 200;

/** Builds the due-date check with an injectable clock (server and tests). */
export function dueAtSchema(now: () => number = Date.now) {
  return z
    .number({ invalid_type_error: 'Pick a future time', required_error: 'Pick a future time' })
    .int()
    .refine((v) => v > now() - FOLLOW_UP_PAST_TOLERANCE_MS, 'Pick a future time')
    .refine((v) => v <= now() + FOLLOW_UP_MAX_AHEAD_MS, 'Follow-up is too far ahead (max 90 days)');
}

const note = z.string().trim().max(FOLLOW_UP_NOTE_MAX).optional();

export function createFollowUpSchema(now: () => number = Date.now) {
  return z.object({ dueAt: dueAtSchema(now), note });
}
export const CreateFollowUpSchema = createFollowUpSchema();
export type CreateFollowUp = z.infer<typeof CreateFollowUpSchema>;

export function patchFollowUpSchema(now: () => number = Date.now) {
  return z.discriminatedUnion('action', [
    z.object({ action: z.literal('complete') }),
    z.object({ action: z.literal('snooze'), dueAt: dueAtSchema(now) }),
    z.object({ action: z.literal('cancel'), note }),
  ]);
}
export const PatchFollowUpSchema = patchFollowUpSchema();
export type PatchFollowUp = z.infer<typeof PatchFollowUpSchema>;

export const ListFollowUpsQuerySchema = z.object({
  view: z.enum(FOLLOW_UP_VIEWS).default('today'),
  owner: z.string().min(1).optional(),
  tz: z.string().min(1).max(64).default('UTC'),
});
export type ListFollowUpsQuery = z.infer<typeof ListFollowUpsQuerySchema>;
