import type { LeadSource, Outcome, Priority, Stage } from './enums';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const YEAR = 365.25 * 24 * HOUR;

/** Every tunable number of the scoring rules lives here (F09 FR-002). */
export const SCORING_WEIGHTS = {
  intent: {
    testDrive: 12,
    finance: 5,
    tradeIn: 5,
    budget: 5,
    model: 4,
    message: 4,
    messageMinChars: 30,
    max: 35,
  },
  source: {
    REFERRAL: 15,
    WALK_IN: 14,
    PHONE: 12,
    WEBSITE: 10,
    GOOGLE_ADS: 8,
    PORTAL: 6,
    FACEBOOK: 5,
    INSTAGRAM: 5,
  } as Record<LeadSource, number>,
  sourceMax: 15,
  customer: { returning: 10, recentPurchase: 5, purchaseWindowYears: 5, max: 15 },
  freshness: {
    tiers: [
      { maxAgeMs: 1 * HOUR, points: 20 },
      { maxAgeMs: 24 * HOUR, points: 15 },
      { maxAgeMs: 72 * HOUR, points: 10 },
      { maxAgeMs: 168 * HOUR, points: 5 },
    ],
    max: 20,
  },
  engagement: {
    base: { INTERESTED: 15, CALLBACK_REQUESTED: 10, CONNECTED: 6, NOT_INTERESTED: 0 } as Partial<
      Record<Outcome, number>
    >,
    unansweredPenalty: 3,
    max: 15,
  },
} as const;

export const PRIORITY_THRESHOLDS = { HOT: 70, WARM: 40 } as const;

export const SLA_TARGETS_MS = { HOT: 15 * MINUTE, OTHER: 120 * MINUTE } as const;
export const SLA_DUE_SOON_FRACTION = 0.25;

export type ScoreFactor = 'intent' | 'source' | 'customer' | 'freshness' | 'engagement';
export type ScoreBreakdownValues = Record<ScoreFactor, number>;

export interface ScoreInput {
  testDriveRequested: boolean;
  wantsFinance: boolean;
  hasTradeIn: boolean;
  budgetMin: number | null;
  budgetMax: number | null;
  vehicleModel: string | null;
  message: string | null;
  source: LeadSource;
  isReturning: boolean;
  lastPurchaseAt: number | null;
  createdAt: number;
  lastPositiveOutcome: Outcome | null;
  unansweredAttempts: number;
}

export interface ScoreReason {
  factor: ScoreFactor;
  label: string;
  points: number;
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  breakdown: ScoreBreakdownValues;
  reasons: ScoreReason[];
}

type Part = { points: number; reasons: ScoreReason[] };

function intent(i: ScoreInput): Part {
  const w = SCORING_WEIGHTS.intent;
  const reasons: ScoreReason[] = [];
  const add = (on: boolean, label: string, points: number) => {
    if (on) reasons.push({ factor: 'intent', label, points });
  };
  add(i.testDriveRequested, 'Test drive requested', w.testDrive);
  add(i.wantsFinance, 'Wants finance', w.finance);
  add(i.hasTradeIn, 'Has a trade-in', w.tradeIn);
  add((i.budgetMin ?? 0) > 0 || (i.budgetMax ?? 0) > 0, 'Budget given', w.budget);
  add(!!i.vehicleModel, 'Specific model chosen', w.model);
  add(
    i.message !== null && [...i.message.trim()].length > w.messageMinChars,
    'Detailed message',
    w.message,
  );
  const points = Math.min(
    w.max,
    reasons.reduce((s, r) => s + r.points, 0),
  );
  return { points, reasons };
}

function source(i: ScoreInput): Part {
  const points = SCORING_WEIGHTS.source[i.source];
  if (points === undefined) {
    console.warn(`scoring: unknown lead source "${String(i.source)}", scoring 0`);
    return { points: 0, reasons: [] };
  }
  return {
    points,
    reasons: [
      { factor: 'source', label: `Source: ${i.source.replace('_', ' ').toLowerCase()}`, points },
    ],
  };
}

function customer(i: ScoreInput, now: number): Part {
  const w = SCORING_WEIGHTS.customer;
  const reasons: ScoreReason[] = [];
  if (i.isReturning)
    reasons.push({ factor: 'customer', label: 'Returning customer', points: w.returning });
  if (i.lastPurchaseAt !== null && now - i.lastPurchaseAt <= w.purchaseWindowYears * YEAR) {
    reasons.push({
      factor: 'customer',
      label: 'Purchase in the last 5 years',
      points: w.recentPurchase,
    });
  }
  return {
    points: Math.min(
      w.max,
      reasons.reduce((s, r) => s + r.points, 0),
    ),
    reasons,
  };
}

function freshness(i: ScoreInput, now: number): Part {
  const age = Math.max(0, now - i.createdAt);
  const tier = SCORING_WEIGHTS.freshness.tiers.find((t) => age < t.maxAgeMs);
  const points = tier?.points ?? 0;
  const label = points === 0 ? 'Lead is over a week old' : `Fresh lead (${describeAge(age)} old)`;
  return { points, reasons: [{ factor: 'freshness', label, points }] };
}

function describeAge(ms: number): string {
  if (ms < HOUR) return `${Math.max(0, Math.floor(ms / MINUTE))} min`;
  if (ms < 48 * HOUR) return `${Math.floor(ms / HOUR)} h`;
  return `${Math.floor(ms / (24 * HOUR))} d`;
}

function engagement(i: ScoreInput): Part {
  const w = SCORING_WEIGHTS.engagement;
  const reasons: ScoreReason[] = [];
  const base = i.lastPositiveOutcome ? (w.base[i.lastPositiveOutcome] ?? 0) : 0;
  if (i.lastPositiveOutcome && base > 0) {
    const name = i.lastPositiveOutcome.replace('_', ' ').toLowerCase();
    reasons.push({ factor: 'engagement', label: `Last outcome: ${name}`, points: base });
  }
  const penalty = w.unansweredPenalty * Math.max(0, i.unansweredAttempts);
  if (penalty > 0) {
    const n = i.unansweredAttempts;
    reasons.push({
      factor: 'engagement',
      label: `${n} unanswered attempt${n === 1 ? '' : 's'}`,
      points: -penalty,
    });
  }
  return { points: Math.min(w.max, Math.max(0, base - penalty)), reasons };
}

export function priorityForScore(score: number): Priority {
  return score >= PRIORITY_THRESHOLDS.HOT
    ? 'HOT'
    : score >= PRIORITY_THRESHOLDS.WARM
      ? 'WARM'
      : 'COOL';
}

/** Pure, deterministic lead score (FR-001…FR-005). */
export function scoreLead(input: ScoreInput, now: number): ScoreResult {
  const parts = {
    intent: intent(input),
    source: source(input),
    customer: customer(input, now),
    freshness: freshness(input, now),
    engagement: engagement(input),
  };
  const breakdown = {
    intent: parts.intent.points,
    source: parts.source.points,
    customer: parts.customer.points,
    freshness: parts.freshness.points,
    engagement: parts.engagement.points,
  };
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
  const score = Math.round(Math.min(100, Math.max(0, total)));
  return {
    score,
    priority: priorityForScore(score),
    breakdown,
    reasons: Object.values(parts).flatMap((p) => p.reasons),
  };
}

/** Same as scoreLead; the UI calls it because only the 5-number breakdown is persisted. */
export const explainScore = scoreLead;

/** Closed leads keep the score they had at closing (FR-007). */
export function isScoreFrozen(stage: Stage): boolean {
  return stage === 'WON' || stage === 'LOST';
}

export type SlaStatus = 'BREACHED' | 'DUE_SOON' | 'OK' | 'NA';

export interface SlaInput {
  stage: Stage;
  priority: Priority;
  createdAt: number;
  /** True once a contact activity (USER, type ≠ NOTE) exists, i.e. first_response_at is set. */
  hasContact: boolean;
}

export function slaStatus(
  lead: SlaInput,
  now: number,
): { status: SlaStatus; deadline: number | null } {
  if (lead.stage !== 'NEW' || lead.hasContact) return { status: 'NA', deadline: null };
  const target = lead.priority === 'HOT' ? SLA_TARGETS_MS.HOT : SLA_TARGETS_MS.OTHER;
  const deadline = lead.createdAt + target;
  if (now > deadline) return { status: 'BREACHED', deadline };
  if (now >= deadline - target * SLA_DUE_SOON_FRACTION) return { status: 'DUE_SOON', deadline };
  return { status: 'OK', deadline };
}
