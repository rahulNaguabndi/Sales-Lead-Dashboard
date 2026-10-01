import { COUNTRIES, type Stage, type TeamRegion } from '@leaddesk/shared';
import { rng } from './utils/rng';
import { clock, DAY, HOUR, MINUTE } from './utils/time';
import { newId } from './utils/ids';
import { randomPrefs, randomSource, teamForCustomer } from './leads';
import type { BuiltLead, CustomerRow, FollowUpRow, LeadPlan, OrgResult } from './types';

const OPEN_STAGES: Stage[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION'];
const isOpen = (s: Stage) => OPEN_STAGES.includes(s);

type Ctx = {
  org: OrgResult;
  customers: CustomerRow[];
  rr: { rr: number };
};

function customersIn(customers: CustomerRow[], region: TeamRegion): CustomerRow[] {
  return customers.filter(
    (c) =>
      (COUNTRIES as Record<string, { region: TeamRegion | null }>)[c.country]?.region === region,
  );
}

function scenarioPlan(
  ctx: Ctx,
  customer: CustomerRow,
  o: Partial<LeadPlan> & Pick<LeadPlan, 'createdAt' | 'stage'>,
): LeadPlan {
  const teamId = teamForCustomer(customer, ctx.org, ctx.rr);
  const { source, sourceDetail } = randomSource();
  return {
    id: newId(o.createdAt),
    customer,
    teamId,
    ownerId: rng.pick(ctx.org.repsByTeam[teamId] ?? []),
    source,
    sourceDetail,
    ...randomPrefs(),
    movable: false,
    ...o,
  };
}

/** Rep imbalance (FR-037): Felix ~38 open leads at ~60% coverage, Lea ~15. Mutates base plans. */
export function rebalanceDach(plans: LeadPlan[], org: OrgResult): { felixNeglected: number } {
  const dach = org.teamByRegion.DACH as string;
  const felix = org.repIdByName['Felix Wagner'] as string;
  const lea = org.repIdByName['Lea Hoffmann'] as string;
  const others = (org.repsByTeam[dach] ?? []).filter((id) => id !== felix && id !== lea);
  const openOf = (id: string) =>
    plans.filter((p) => p.teamId === dach && p.ownerId === id && isOpen(p.stage));
  const movable = (excl: string[]) =>
    plans.filter(
      (p) =>
        p.movable &&
        p.teamId === dach &&
        p.stage !== 'NEW' &&
        isOpen(p.stage) &&
        p.ownerId &&
        !excl.includes(p.ownerId),
    );

  for (const p of openOf(lea)
    .filter((p) => p.movable)
    .slice(15))
    p.ownerId = rng.pick(others);
  while (openOf(felix).length < 38) {
    const pool = movable([felix]);
    if (pool.length === 0) break;
    (rng.pick(pool) as LeadPlan).ownerId = felix;
  }
  for (const p of openOf(felix)
    .filter((p) => p.movable)
    .slice(38))
    p.ownerId = rng.pick(others);

  const now = clock.now;
  const felixOpen = openOf(felix);
  const workable = felixOpen.filter((p) => p.stage !== 'NEW');
  const recentCount = Math.round(0.6 * felixOpen.length);
  let neglected = felixOpen.length - Math.min(recentCount, workable.length);
  rng.shuffle(workable).forEach((p, i) => {
    if (!p.movable) return;
    if (i < recentCount) {
      p.endAt = now - rng.float(2, 44) * HOUR;
    } else {
      p.endAt = now - 3 * DAY - rng.float(2, 70) * HOUR; // 3-6 days: at risk
    }
    if (p.createdAt > p.endAt - 2 * DAY) p.createdAt = p.endAt - rng.float(2, 15) * DAY;
  });
  neglected =
    workable.filter((p) => p.endAt !== undefined && now - p.endAt >= 3 * DAY).length +
    felixOpen.filter((p) => p.stage === 'NEW').length;
  return { felixNeglected: neglected };
}

export type ScenarioResult = { plans: LeadPlan[]; forceHot: Set<string> };

/** Deliberately neglected and demo-critical leads (FR-037), as extra plans. */
export function planScenarioLeads(ctx: Ctx, felixNeglected: number): ScenarioResult {
  const now = clock.now;
  const plans: LeadPlan[] = [];
  const forceHot = new Set<string>();
  const { customers } = ctx;
  const regionNames: TeamRegion[] = ['DACH', 'WEST', 'SOUTH'];

  // 1. 25 unassigned leads created within the last 48 hours (DACH 10, West 8, South 7).
  for (const [region, count] of [
    ['DACH', 10],
    ['WEST', 8],
    ['SOUTH', 7],
  ] as [TeamRegion, number][]) {
    const pool = customersIn(customers, region);
    for (let i = 0; i < count; i++) {
      plans.push(
        scenarioPlan(ctx, rng.pick(pool), {
          createdAt: now - rng.float(10 * MINUTE, 47 * HOUR),
          stage: 'NEW',
          ownerId: null,
        }),
      );
    }
  }

  // 2. 12 SLA-breach leads: NEW, owned, no contact, 20 min-6 h old; 4 HOT; 2 carry only a NOTE.
  for (let i = 0; i < 12; i++) {
    const pool = customersIn(customers, regionNames[i % 3] as TeamRegion);
    const onlyNote = i === 4 || i === 5;
    const plan = scenarioPlan(ctx, rng.pick(pool), {
      createdAt: now - rng.float(onlyNote ? 70 : 20, 6 * 60) * MINUTE,
      stage: 'NEW',
      noContact: true,
      onlyNote,
    });
    if (i < 4) {
      plan.forceHot = true;
      forceHot.add(plan.id);
    }
    plans.push(plan);
  }

  // 3. At-risk leads: open, last activity 3-6 days ago (Felix's neglected leads already count).
  const pickOpen = () =>
    rng.weightedPick(
      ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION'] as Stage[],
      [40, 30, 20, 10],
    );
  for (let i = 0; i < Math.max(0, 20 - felixNeglected); i++) {
    const endAt = now - 3 * DAY - rng.float(2, 70) * HOUR;
    plans.push(
      scenarioPlan(ctx, rng.pick(customersIn(customers, regionNames[i % 3] as TeamRegion)), {
        createdAt: endAt - rng.float(2, 12) * DAY,
        stage: pickOpen(),
        endAt,
      }),
    );
  }

  // 4. Five leads whose last activity was exactly 6 days 23 hours ago (cold detector demo).
  for (let i = 0; i < 5; i++) {
    const endAt = now - (6 * DAY + 23 * HOUR);
    plans.push(
      scenarioPlan(ctx, rng.pick(customersIn(customers, regionNames[i % 3] as TeamRegion)), {
        createdAt: endAt - rng.float(2, 10) * DAY,
        stage: rng.pick(['CONTACTED', 'QUALIFIED'] as Stage[]),
        endAt,
        activityCount: 4,
      }),
    );
  }

  return { plans, forceHot };
}

export function planHeroLeads(
  org: OrgResult,
  giulia: CustomerRow,
  markus: CustomerRow,
): { plans: LeadPlan[]; forceHot: Set<string> } {
  const now = clock.now;
  const sofia = org.repIdByName['Sofia Rossi'] as string;
  const anna = org.repIdByName['Anna Weber'] as string;
  const forceHot = new Set<string>();
  const giuliaPlan: LeadPlan = {
    id: newId(now - 28 * HOUR),
    customer: giulia,
    teamId: org.teamByRegion.SOUTH as string,
    ownerId: sofia,
    source: 'WEBSITE',
    sourceDetail: null,
    createdAt: now - 28 * HOUR,
    stage: 'CONTACTED',
    vehicleModel: 'aurora-suv',
    budgetMin: 3_500_000,
    budgetMax: 4_200_000,
    hasTradeIn: true,
    wantsFinance: true,
    testDriveRequested: true,
    message:
      'Buongiorno, sono interessata alla Aurora SUV. Ho un’auto da permutare e vorrei provarla sabato.',
    movable: false,
    endAt: now - 3 * HOUR,
    activityCount: 3,
    forceHot: true,
  };
  forceHot.add(giuliaPlan.id);
  const markusPlan: LeadPlan = {
    id: newId(now - 9 * DAY),
    customer: markus,
    teamId: org.teamByRegion.DACH as string,
    ownerId: anna,
    source: 'REFERRAL',
    sourceDetail: null,
    createdAt: now - 9 * DAY,
    stage: 'QUALIFIED',
    vehicleModel: 'luma-ev',
    budgetMin: 3_800_000,
    budgetMax: 4_500_000,
    hasTradeIn: true,
    wantsFinance: true,
    testDriveRequested: false,
    message: 'Ich fahre seit 2021 einen Vento und möchte auf ein Elektroauto umsteigen.',
    movable: false,
    endAt: now - 26 * HOUR,
    activityCount: 5,
  };
  return { plans: [giuliaPlan, markusPlan], forceHot };
}

/** 30 overdue, 20 due-today and 40 future PENDING follow-ups on distinct open, owned leads. */
export function planFollowUps(built: BuiltLead[]): FollowUpRow[] {
  const now = clock.now;
  const d = new Date(now);
  const endOfDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY - MINUTE;
  const pool = rng.shuffle(
    built.filter((b) => b.lead.ownerId && b.lead.stage !== 'NEW' && isOpen(b.lead.stage as Stage)),
  );
  // Notes must fit the lead: no "test drive" task for a lead past that stage or without the request.
  const followUpNotes = (stage: Stage, testDrive: boolean): string[] => {
    const notes = ['Call back about the quote', 'Send financing options', 'Confirm appointment'];
    if (testDrive && (stage === 'CONTACTED' || stage === 'QUALIFIED')) {
      notes.push('Check test drive availability');
    }
    return notes;
  };
  const out: FollowUpRow[] = [];
  const mk = (b: BuiltLead, dueAt: number): FollowUpRow => {
    const createdAt = Math.max(
      b.lead.createdAt as number,
      Math.min(dueAt - rng.float(0.5, 4) * DAY, now - MINUTE),
    );
    return {
      id: newId(createdAt),
      leadId: b.lead.id as string,
      assignedTo: b.lead.ownerId as string,
      dueAt: Math.round(dueAt),
      status: 'PENDING',
      note: rng.pick(followUpNotes(b.lead.stage as Stage, !!b.lead.testDriveRequested)),
      createdBy: b.lead.ownerId as string,
      createdAt: Math.round(createdAt),
      completedAt: null,
      completedByActivityId: null,
    };
  };
  let i = 0;
  for (let n = 0; n < 30 && i < pool.length; n++)
    out.push(mk(pool[i++] as BuiltLead, now - rng.float(1 * HOUR, 3 * DAY)));
  const todayHi = Math.max(endOfDay, now + 30 * MINUTE);
  for (let n = 0; n < 20 && i < pool.length; n++)
    out.push(mk(pool[i++] as BuiltLead, rng.float(now + MINUTE, todayHi)));
  for (let n = 0; n < 40 && i < pool.length; n++)
    out.push(mk(pool[i++] as BuiltLead, rng.float(todayHi + HOUR, now + 7 * DAY)));
  return out;
}
