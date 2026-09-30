import {
  COUNTRIES,
  VEHICLES,
  type LeadSource,
  type Stage,
  type TeamRegion,
} from '@leaddesk/shared';
import { rng } from './utils/rng';
import { clock, DAY, HOUR, MINUTE } from './utils/time';
import { newId } from './utils/ids';
import type { CustomerRow, LeadPlan, OrgResult } from './types';

const SOURCES: [LeadSource, number][] = [
  ['WEBSITE', 35],
  ['GOOGLE_ADS', 15],
  ['FACEBOOK', 11],
  ['INSTAGRAM', 9],
  ['WALK_IN', 10],
  ['PHONE', 8],
  ['REFERRAL', 7],
  ['PORTAL', 5],
];

// REFERRAL and WALK_IN convert best, social worst (FR-035).
const SOURCE_CONVERSION: Record<LeadSource, number> = {
  REFERRAL: 1.8,
  WALK_IN: 1.6,
  WEBSITE: 1.0,
  PHONE: 1.0,
  PORTAL: 0.9,
  GOOGLE_ADS: 0.8,
  FACEBOOK: 0.55,
  INSTAGRAM: 0.5,
};

const STAGE_ORDER: Stage[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'TEST_DRIVE',
  'NEGOTIATION',
  'WON',
  'LOST',
  'COLD',
];

// Stage weights by lead age bucket: [NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON, LOST, COLD].
// Old leads are mostly closed or cold; COLD needs at least 8 days of age (7 days without contact).
const AGE_WEIGHTS: { maxDays: number; weights: number[] }[] = [
  { maxDays: 2, weights: [70, 22, 4, 1, 0, 0, 3, 0] },
  { maxDays: 8, weights: [4, 36, 24, 14, 9, 4, 9, 0] },
  { maxDays: 30, weights: [1, 23, 18, 12, 9, 15, 13, 9] },
  { maxDays: 60, weights: [0, 6, 6, 3, 3, 20, 40, 22] },
  { maxDays: Infinity, weights: [0, 2, 2, 1, 1, 20, 48, 26] },
];

export function pickStage(
  ageDays: number,
  source: LeadSource,
  repId: string | null,
  repFactor: Record<string, number>,
): Stage {
  const bucket =
    AGE_WEIGHTS.find((b) => ageDays < b.maxDays) ?? AGE_WEIGHTS[AGE_WEIGHTS.length - 1];
  const weights = [...(bucket?.weights ?? [])];
  const mult = SOURCE_CONVERSION[source] * (repId ? (repFactor[repId] ?? 1) : 1);
  weights[5] = (weights[5] ?? 0) * mult;
  return rng.weightedPick(STAGE_ORDER, weights);
}

const MESSAGES = [
  'I would like to arrange a test drive this week.',
  'Could you send me a quote including financing?',
  'Interested in the latest model, what is the delivery time?',
  'I have a car to trade in, what could you offer?',
  'Looking for a family car, please call me back.',
  'Is this model available in other colours?',
  'Please contact me about current promotions.',
];

export type VehiclePrefs = Pick<
  LeadPlan,
  | 'vehicleModel'
  | 'budgetMin'
  | 'budgetMax'
  | 'hasTradeIn'
  | 'wantsFinance'
  | 'testDriveRequested'
  | 'message'
>;

export function randomPrefs(): VehiclePrefs {
  const hasVehicle = rng.chance(0.9);
  const vehicle = hasVehicle ? rng.pick(VEHICLES) : null;
  let budgetMin: number | null = null;
  let budgetMax: number | null = null;
  if (vehicle && rng.chance(0.7)) {
    budgetMax = Math.round((vehicle.priceCents * rng.float(0.9, 1.15)) / 50_000) * 50_000;
    budgetMin = Math.round((budgetMax * rng.float(0.7, 0.9)) / 50_000) * 50_000;
  }
  return {
    vehicleModel: vehicle?.slug ?? null,
    budgetMin,
    budgetMax,
    hasTradeIn: rng.chance(0.35),
    wantsFinance: rng.chance(0.3),
    testDriveRequested: rng.chance(0.25),
    message: rng.chance(0.6) ? rng.pick(MESSAGES) : null,
  };
}

export function randomSource(): { source: LeadSource; sourceDetail: string | null } {
  const source = rng.weightedPick(
    SOURCES.map(([s]) => s),
    SOURCES.map(([, w]) => w),
  );
  return {
    source,
    sourceDetail: source === 'PORTAL' ? rng.pick(['mobile.de', 'AutoScout24']) : null,
  };
}

/** Team by the customer's country (FR-034); PL/IE/DK round-robin across the three teams. */
export function teamForCustomer(
  customer: CustomerRow,
  org: OrgResult,
  state: { rr: number },
): string {
  const region = (COUNTRIES as Record<string, { region: TeamRegion | null }>)[customer.country]
    ?.region;
  if (region) return org.teamByRegion[region] as string;
  const regions = Object.keys(org.teamByRegion);
  return org.teamByRegion[regions[state.rr++ % regions.length] as string] as string;
}

/** A lead creation time following the 40/35/25 recency weighting, inside working hours. */
function baseCreatedAt(): number {
  const now = clock.now;
  const [lo, hi] = rng.weightedPick(
    [
      [0, 30],
      [30, 60],
      [60, 90],
    ] as [number, number][],
    [40, 35, 25],
  );
  const day = rng.float(lo, hi);
  const base = now - day * DAY;
  const d = new Date(base);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let ts = dayStart + rng.int(8 * 60, 19 * 60 + 30) * MINUTE;
  if (ts > now - 30 * MINUTE) ts = now - rng.float(0.5, 20) * HOUR;
  return ts;
}

export function planBaseLeads(total: number, customers: CustomerRow[], org: OrgResult): LeadPlan[] {
  const now = clock.now;
  const order = rng.shuffle(customers);
  const rr = { rr: 0 };
  const plans: LeadPlan[] = [];
  for (let i = 0; i < total; i++) {
    const customer = i < order.length ? (order[i] as CustomerRow) : rng.pick(customers);
    const teamId = teamForCustomer(customer, org, rr);
    const ownerId = rng.pick(org.repsByTeam[teamId] ?? []);
    const { source, sourceDetail } = randomSource();
    const createdAt = baseCreatedAt();
    const ageDays = (now - createdAt) / DAY;
    plans.push({
      id: newId(createdAt),
      customer,
      teamId,
      ownerId,
      source,
      sourceDetail,
      createdAt,
      stage: pickStage(ageDays, source, ownerId, org.repFactor),
      ...randomPrefs(),
      movable: true,
    });
  }
  return plans;
}
