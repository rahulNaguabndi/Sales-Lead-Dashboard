import {
  VEHICLES,
  isContactActivity,
  type ActivityType,
  type LostReason,
  type Outcome,
  type Stage,
} from '@leaddesk/shared';
import { rng } from './utils/rng';
import { clock, DAY, HOUR, MINUTE, workTime } from './utils/time';
import { newId } from './utils/ids';
import { nextReference } from './utils/reference';
import type {
  ActivityRow,
  BuiltLead,
  CustomerRow,
  FollowUpRow,
  LeadPlan,
  LeadRow,
  OfferRow,
  StageHistoryRow,
} from './types';

const LOST_REASON_WEIGHTS: [LostReason, number][] = [
  ['PRICE', 30],
  ['BOUGHT_ELSEWHERE', 25],
  ['NOT_READY', 20],
  ['UNREACHABLE', 15],
  ['FINANCING_DECLINED', 5],
  ['OTHER', 5],
];

const ACTIVITY_COUNT: Record<Stage, [number, number]> = {
  NEW: [0, 0],
  CONTACTED: [3, 6],
  QUALIFIED: [4, 8],
  TEST_DRIVE: [5, 10],
  NEGOTIATION: [6, 12],
  WON: [7, 15],
  LOST: [3, 12],
  COLD: [3, 8],
};

const CONTACT_TYPES: ActivityType[] = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'];

function stagePath(stage: Stage): Stage[] {
  switch (stage) {
    case 'NEW':
      return [];
    case 'CONTACTED':
      return ['CONTACTED'];
    case 'QUALIFIED':
      return ['CONTACTED', 'QUALIFIED'];
    case 'TEST_DRIVE':
      return ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE'];
    case 'NEGOTIATION':
      return rng.chance(0.7)
        ? ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION']
        : ['CONTACTED', 'QUALIFIED', 'NEGOTIATION'];
    case 'WON':
      return rng.chance(0.7)
        ? ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION', 'WON']
        : ['CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'WON'];
    case 'LOST': {
      const open: Stage[] = ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION'];
      return [...open.slice(0, rng.int(1, 4)), 'LOST'];
    }
    case 'COLD':
      return rng.chance(0.4) ? ['CONTACTED', 'QUALIFIED', 'COLD'] : ['CONTACTED', 'COLD'];
  }
}

function pickOutcome(type: ActivityType): Outcome | null {
  switch (type) {
    case 'CALL':
      return rng.weightedPick(
        [
          'NO_ANSWER',
          'VOICEMAIL',
          'CONNECTED',
          'INTERESTED',
          'CALLBACK_REQUESTED',
          'NOT_INTERESTED',
        ] as Outcome[],
        [22, 12, 34, 18, 8, 6],
      );
    case 'WHATSAPP':
    case 'SMS':
    case 'EMAIL':
      return rng.weightedPick(
        [null, 'CONNECTED', 'INTERESTED', 'NO_ANSWER'] as (Outcome | null)[],
        [45, 20, 22, 13],
      );
    case 'MEETING':
    case 'TEST_DRIVE':
      return rng.weightedPick(['CONNECTED', 'INTERESTED'] as Outcome[], [60, 40]);
    default:
      return null;
  }
}

const NOTE_TEXT: Record<string, string[]> = {
  CALL: [
    'Called the customer.',
    'Phone conversation about the vehicle.',
    'Discussed pricing over the phone.',
  ],
  WHATSAPP: [
    'Sent WhatsApp message.',
    'Shared brochure via WhatsApp.',
    'WhatsApp chat about availability.',
  ],
  SMS: ['Sent SMS with dealership details.', 'SMS reminder about appointment.'],
  EMAIL: [
    'Emailed the quote.',
    'Sent follow-up email with options.',
    'Email exchange about financing.',
  ],
  MEETING: ['Met the customer at the showroom.', 'Showroom visit and vehicle walk-around.'],
  TEST_DRIVE: ['Completed the test drive.', 'Test drive done, positive feedback.'],
  NOTE: [
    'Customer prefers evenings.',
    'Waiting on trade-in valuation.',
    'Spouse involved in the decision.',
  ],
};

function noteFor(type: ActivityType, outcome: Outcome | null): string {
  const base = rng.pick(NOTE_TEXT[type] ?? ['Update logged.']);
  if (outcome === 'NO_ANSWER') return `${base} No answer.`;
  if (outcome === 'VOICEMAIL') return `${base} Left a voicemail.`;
  return base;
}

function eligibleOffer(plan: LeadPlan, at: number, offers: OfferRow[]): OfferRow | undefined {
  return offers.find((o) => {
    if (at < o.validFrom || at > o.validTo) return false;
    const e = o.eligibility;
    if (e.customerType === 'RETURNING' && !plan.customer.isReturning) return false;
    if (e.customerType === 'NEW' && plan.customer.isReturning) return false;
    if (e.requiresTradeIn && !plan.hasTradeIn) return false;
    if (e.requiresFinance && !plan.wantsFinance) return false;
    if (e.models && (!plan.vehicleModel || !e.models.includes(plan.vehicleModel))) return false;
    if (e.countries && !e.countries.includes(plan.customer.country)) return false;
    if (e.minBudget && (plan.budgetMax ?? 0) < e.minBudget) return false;
    if (e.sources && !e.sources.includes(plan.source)) return false;
    return true;
  });
}

function activityType(k: number, customer: CustomerRow): ActivityType {
  if (k > 0 && rng.chance(0.15)) return 'NOTE';
  if (rng.chance(0.06)) return 'MEETING';
  if (rng.chance(0.6)) return customer.preferredChannel;
  return rng.pick(CONTACT_TYPES);
}

/** Builds one lead row plus a coherent timeline, stage history and (for WON) a purchase. */
export function buildLead(plan: LeadPlan, offers: OfferRow[]): BuiltLead {
  const now = clock.now;
  const t0 = Math.round(plan.createdAt);
  const ownerId = plan.ownerId;
  const acts: ActivityRow[] = [];
  const history: StageHistoryRow[] = [];
  let last = -Infinity;

  const add = (
    row: Omit<ActivityRow, 'id' | 'leadId' | 'createdAt'>,
    at: number,
    gap = MINUTE,
  ): ActivityRow | null => {
    const ts = Math.round(Math.max(at, last + gap));
    if (ts > now) return null;
    last = ts;
    const full: ActivityRow = { ...row, id: newId(ts), leadId: plan.id, createdAt: ts };
    acts.push(full);
    return full;
  };
  const addSystem = (
    type: ActivityType,
    at: number,
    metadata: Record<string, unknown> | null,
    gap = 1000,
  ) =>
    add(
      { actorId: null, kind: 'SYSTEM', type, outcome: null, note: '', aiAssisted: false, metadata },
      at,
      gap,
    );
  const addStage = (
    from: Stage,
    to: Stage,
    at: number,
    changedBy: string | null,
    reason: string | null,
  ) => {
    const a = addSystem(to === 'COLD' ? 'AUTO_COLD' : 'STAGE_CHANGED', at, { from, to });
    if (!a) return null;
    history.push({
      id: newId(a.createdAt as number),
      leadId: plan.id,
      fromStage: from,
      toStage: to,
      changedBy,
      reason,
      changedAt: a.createdAt as number,
    });
    return a.createdAt as number;
  };

  addSystem('LEAD_CREATED', t0, null, 0);
  history.push({
    id: newId(t0),
    leadId: plan.id,
    fromStage: null,
    toStage: 'NEW',
    changedBy: null,
    reason: null,
    changedAt: t0,
  });

  let assignedAt: number | null = null;
  if (ownerId) {
    const maxMin = Math.max(2, Math.min(30, (0.4 * (now - t0)) / MINUTE));
    const a = addSystem('ASSIGNED', t0 + rng.float(1, maxMin) * MINUTE, {
      toOwnerId: ownerId,
      method: 'AUTO',
    });
    assignedAt = a?.createdAt ?? null;
  }

  let currentStage: Stage = 'NEW';
  let closedAt: number | null = null;
  let lostReason: LostReason | null = null;
  let purchase: BuiltLead['purchase'];
  let appliedOfferId: string | null = null;
  let dealValue: number | null = null;
  const userActs: ActivityRow[] = [];
  let vehicleModel = plan.vehicleModel;

  if (plan.stage === 'NEW') {
    if (plan.onlyNote && ownerId) {
      const n = add(
        {
          actorId: ownerId,
          kind: 'USER',
          type: 'NOTE',
          outcome: null,
          note: 'Internal note: checking availability before calling.',
          aiAssisted: false,
          metadata: null,
        },
        t0 + (now - t0) * rng.float(0.5, 0.9),
      );
      if (n) userActs.push(n);
    }
  } else if (ownerId) {
    const path = stagePath(plan.stage);
    const terminal = plan.stage === 'WON' || plan.stage === 'LOST' || plan.stage === 'COLD';
    const mid = terminal ? path.slice(1, -1) : path.slice(1);
    const [lo, hi] = ACTIVITY_COUNT[plan.stage];
    const n = Math.min(15, Math.max(3, plan.activityCount ?? rng.int(lo, hi)));

    lostReason =
      plan.stage === 'LOST'
        ? (plan.lostReason ??
          rng.weightedPick(
            LOST_REASON_WEIGHTS.map(([r]) => r),
            LOST_REASON_WEIGHTS.map(([, w]) => w),
          ))
        : null;

    // Time window of the user activities. An explicit plan.endAt pins the LAST activity exactly
    // (scenarios rely on e.g. "6 days 23 hours ago"), so earlier ones are kept well before it.
    let firstAt = t0 + rng.float(0.2, 1) * Math.min(30 * HOUR, 0.6 * (now - t0));
    let endAt: number;
    let exact = plan.endAt !== undefined && plan.endAt - t0 >= 20 * HOUR;
    if (plan.stage === 'WON' || plan.stage === 'LOST') {
      endAt = t0 + (now - t0) * rng.float(0.35, 0.92);
    } else if (plan.stage === 'COLD') {
      const hi7 = now - 7 * DAY - 15 * HOUR;
      endAt = plan.endAt ?? t0 + (hi7 - t0) * rng.float(0.3, 1);
    } else {
      endAt =
        plan.endAt ?? now - rng.float(0.3, Math.min(60, Math.max(1, (now - t0) / HOUR))) * HOUR;
    }
    if (!exact) {
      endAt = Math.min(
        Math.max(endAt, t0 + 30 * MINUTE),
        now - 2 * HOUR > t0 ? now - 2 * HOUR : now - 1000,
      );
    }
    firstAt = Math.max(
      t0 + 5 * MINUTE,
      Math.min(firstAt, t0 + 0.5 * (endAt - t0), exact ? endAt - 16 * HOUR : Infinity),
    );
    if (exact && firstAt > endAt - 15 * HOUR) exact = false;
    if (!exact && endAt - firstAt < (n - 1) * 3 * MINUTE)
      endAt = Math.min(now - 1000, firstAt + (n - 1) * 3 * MINUTE);

    const midHi = exact ? endAt - 15 * HOUR : endAt;
    const mids = Array.from({ length: n - 2 }, () => rng.float(firstAt, midHi)).sort(
      (a, b) => a - b,
    );
    const times = [firstAt, ...mids].map((t) => workTime(t));
    times.push(exact ? endAt : workTime(endAt));

    const trailingUnanswered =
      plan.stage === 'COLD' || lostReason === 'UNREACHABLE'
        ? 3
        : !terminal && rng.chance(0.2)
          ? rng.int(1, 2)
          : 0;
    const reachesTestDrive = path.includes('TEST_DRIVE');
    const testDriveIdx = reachesTestDrive
      ? Math.min(
          n - 2,
          Math.max(1, Math.floor(((path.indexOf('TEST_DRIVE') + 1) / (path.length + 1)) * n)),
        )
      : -1;
    const stageAt = new Map<number, Stage[]>();
    mid.forEach((s, j) => {
      const idx = Math.min(n - 1, Math.max(1, Math.floor(((j + 1) / (mid.length + 1)) * (n - 1))));
      stageAt.set(idx, [...(stageAt.get(idx) ?? []), s]);
    });

    for (let k = 0; k < n; k++) {
      let type = activityType(k, plan.customer);
      let outcome: Outcome | null;
      if (n - k <= trailingUnanswered) {
        type = rng.chance(0.7) ? 'CALL' : rng.pick(['WHATSAPP', 'SMS'] as ActivityType[]);
        outcome = type === 'CALL' ? rng.pick(['NO_ANSWER', 'VOICEMAIL'] as Outcome[]) : 'NO_ANSWER';
      } else {
        if (k === testDriveIdx) type = 'TEST_DRIVE';
        outcome = pickOutcome(type);
        // Keep unanswered attempts out of the middle of an otherwise answered history's tail.
        if (
          n - k === trailingUnanswered + 1 &&
          (outcome === 'NO_ANSWER' || outcome === 'VOICEMAIL')
        )
          outcome = 'CONNECTED';
      }
      const a = add(
        {
          actorId: ownerId,
          kind: 'USER',
          type,
          outcome,
          note: noteFor(type, outcome),
          aiAssisted: false,
          metadata: null,
        },
        times[k] as number,
      );
      if (!a) break;
      userActs.push(a);
      if (k === 0) {
        const t = addStage(
          'NEW',
          'CONTACTED',
          (a.createdAt as number) + 1000,
          ownerId,
          'First contact',
        );
        if (t) currentStage = 'CONTACTED';
      }
      for (const s of stageAt.get(k) ?? []) {
        const t = addStage(currentStage, s, (a.createdAt as number) + 1000, ownerId, null);
        if (t) currentStage = s;
      }
    }

    const lastUser = last;
    if (plan.stage === 'WON') {
      vehicleModel = vehicleModel ?? rng.pick(VEHICLES).slug;
      const vehicle = VEHICLES.find((v) => v.slug === vehicleModel) ?? VEHICLES[0];
      const offer = rng.chance(0.3)
        ? eligibleOffer({ ...plan, vehicleModel }, lastUser, offers)
        : undefined;
      if (offer) {
        const oa = addSystem('OFFER_APPLIED', lastUser + 1000, {
          offerId: offer.id,
          title: offer.title,
        });
        if (oa) appliedOfferId = offer.id as string;
      }
      const t = addStage(currentStage, 'WON', last + 1000, ownerId, 'Deal closed');
      if (t) {
        currentStage = 'WON';
        closedAt = t;
        dealValue = Math.round((vehicle.priceCents * rng.float(0.9, 1.1)) / 100) * 100;
        purchase = {
          id: newId(t),
          customerId: plan.customer.id,
          leadId: plan.id,
          vehicleModel: vehicle.slug,
          amount: dealValue,
          purchasedAt: t,
        };
      }
    } else if (plan.stage === 'LOST') {
      const t = addStage(currentStage, 'LOST', last + 1000, ownerId, lostReason);
      if (t) {
        currentStage = 'LOST';
        closedAt = t;
      }
    } else if (plan.stage === 'COLD') {
      const t = addStage(
        currentStage,
        'COLD',
        Math.min(lastUser + 7 * DAY + rng.float(0, 6) * HOUR, now - 1000),
        null,
        'No contact for 7 days',
      );
      if (t) currentStage = 'COLD';
    }
  }

  // Derived lead fields come from the generated activities (FR-036).
  const contact = userActs.filter((a) => isContactActivity(a.type, a.kind));
  let attemptCount = 0;
  for (let i = contact.length - 1; i >= 0; i--) {
    const o = contact[i]?.outcome;
    if (o === 'NO_ANSWER' || o === 'VOICEMAIL') attemptCount++;
    else break;
  }
  const lastUserAct = userActs[userActs.length - 1];
  const lastContactAct = contact[contact.length - 1];
  const lastEvent = acts[acts.length - 1]?.createdAt as number;

  const lead: LeadRow = {
    id: plan.id,
    reference: nextReference(),
    customerId: plan.customer.id,
    teamId: plan.teamId,
    ownerId,
    source: plan.source,
    sourceDetail: plan.sourceDetail,
    stage: currentStage,
    vehicleModel,
    budgetMin: plan.budgetMin,
    budgetMax: plan.budgetMax,
    hasTradeIn: plan.hasTradeIn,
    wantsFinance: plan.wantsFinance,
    testDriveRequested: plan.testDriveRequested,
    message: plan.message,
    score: 0,
    priority: 'COOL',
    scoreBreakdown: { intent: 0, source: 0, customer: 0, freshness: 0, engagement: 0 },
    attemptCount,
    dealValue,
    appliedOfferId,
    lostReason,
    lostNote: lostReason === 'OTHER' ? 'Customer gave no specific reason.' : null,
    firstResponseAt: (contact[0]?.createdAt as number | undefined) ?? null,
    lastActivityAt: (lastUserAct?.createdAt as number | undefined) ?? null,
    lastContactAt: (lastContactAct?.createdAt as number | undefined) ?? null,
    assignedAt,
    closedAt,
    createdAt: t0,
    updatedAt: lastEvent,
    version: Math.max(0, history.length - 1),
  };

  // Historical completed follow-up on some worked leads.
  let doneFollowUp: FollowUpRow | undefined;
  if (ownerId && userActs.length >= 5 && rng.chance(0.25)) {
    const k = rng.int(1, userActs.length - 3);
    const created = userActs[k]?.createdAt as number;
    const completedBy = userActs[k + 1] as ActivityRow;
    const completedAt = completedBy.createdAt as number;
    doneFollowUp = {
      id: newId(created),
      leadId: plan.id,
      assignedTo: ownerId,
      dueAt: Math.round(created + (completedAt - created) * rng.float(0.6, 1)),
      status: 'DONE',
      note: 'Call back as agreed',
      createdBy: ownerId,
      createdAt: created,
      completedAt,
      completedByActivityId: completedBy.id,
    };
  }

  return { lead, activities: acts, history, purchase, doneFollowUp };
}
