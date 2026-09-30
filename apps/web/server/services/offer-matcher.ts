import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  checkValue,
  formatOfferValue,
  matchOffer,
  matchOffers,
  offerStatus,
  OfferEligibilitySchema,
  type LeadDeskEvent,
  type OfferInput,
  type OfferLeadContext,
  type OfferMatch,
  type OfferStatus,
} from '@leaddesk/shared';
import { cache } from '../cache/cache';
import { db, withTx, type Db } from '../db/client';
import { writeAudit } from '../db/audit';
import { customers, leads, offers } from '../db/schema';
import { bus } from '../events/bus';
import { AppError, NotFoundError, toErrorResponse, ValidationError } from '../http/errors';

export type OfferRow = typeof offers.$inferSelect;

export type OfferDTO = {
  id: string;
  title: string;
  description: string;
  discountType: OfferRow['discountType'];
  value: number | null;
  validFrom: number;
  validTo: number;
  isActive: boolean;
  eligibility: OfferRow['eligibility'];
  status: OfferStatus;
  appliedCount: number;
  wonRevenue: number;
};

export type LeadOfferDTO = {
  offer: OfferDTO;
  reasons: string[];
  endsSoon: boolean;
};

export type OfferStatusFilter = 'active' | 'visible' | 'all';

export type OfferDeps = {
  database?: Db;
  now?: number;
  /** Injectable for tests; defaults to the process event bus. */
  publish?: (e: LeadDeskEvent) => Promise<void>;
};

export class OfferNotApplicableError extends AppError {
  readonly statusCode = 422;
  readonly code = 'OFFER_NOT_APPLICABLE';
  constructor(message = 'This offer cannot be applied to the lead') {
    super(message);
  }
}

export class OfferInUseError extends AppError {
  readonly statusCode = 409;
  readonly code = 'OFFER_IN_USE';
  constructor(
    message = 'This offer is applied to leads and cannot be deleted; deactivate it instead',
  ) {
    super(message);
  }
}

/** Maps offer errors (and any other thrown value) to an HTTP status and error envelope. */
export function toHttpError(err: unknown) {
  return toErrorResponse(err);
}

export const ACTIVE_CACHE_KEY = 'offers:active';
const ACTIVE_TTL_SECONDS = 30;

const conn = (deps: OfferDeps): Db => deps.database ?? db;
const clock = (deps: OfferDeps): number => deps.now ?? Date.now();

function toDTO(
  row: OfferRow,
  now: number,
  stats?: Map<string, { count: number; revenue: number }>,
): OfferDTO {
  const s = stats?.get(row.id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    discountType: row.discountType,
    value: row.value,
    validFrom: row.validFrom,
    validTo: row.validTo,
    isActive: row.isActive,
    eligibility: row.eligibility,
    status: offerStatus(row, now),
    appliedCount: s?.count ?? 0,
    wonRevenue: s?.revenue ?? 0,
  };
}

function appliedStats(database: Db): Map<string, { count: number; revenue: number }> {
  const rows = database
    .select({
      offerId: leads.appliedOfferId,
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${leads.dealValue}), 0)`,
    })
    .from(leads)
    .where(and(isNotNull(leads.appliedOfferId), eq(leads.stage, 'WON')))
    .groupBy(leads.appliedOfferId)
    .all();
  return new Map(rows.map((r) => [r.offerId as string, { count: r.count, revenue: r.revenue }]));
}

/** Offers switched on (validity dates are re-checked by callers); read-through cached when Redis is up. */
async function loadEnabledRows(deps: OfferDeps): Promise<OfferRow[]> {
  const load = async () => conn(deps).select().from(offers).where(eq(offers.isActive, true)).all();
  // Tests inject their own database; only the process database is cached.
  if (deps.database) return load();
  return cache.wrap(ACTIVE_CACHE_KEY, ACTIVE_TTL_SECONDS, load);
}

/** Currently active offers (switched on and inside their validity window). */
export async function listActiveOffers(deps: OfferDeps = {}): Promise<OfferDTO[]> {
  const now = clock(deps);
  const rows = await loadEnabledRows(deps);
  return rows.filter((r) => offerStatus(r, now) === 'ACTIVE').map((r) => toDTO(r, now));
}

export async function listOffers(
  status: OfferStatusFilter,
  deps: OfferDeps = {},
): Promise<OfferDTO[]> {
  const now = clock(deps);
  const database = conn(deps);
  const stats = appliedStats(database);
  const rows =
    status === 'active' ? await loadEnabledRows(deps) : database.select().from(offers).all();
  const wanted: OfferStatus[] =
    status === 'active'
      ? ['ACTIVE']
      : status === 'visible'
        ? ['ACTIVE', 'SCHEDULED']
        : ['ACTIVE', 'SCHEDULED', 'EXPIRED', 'INACTIVE'];
  return rows
    .map((r) => toDTO(r, now, stats))
    .filter((o) => wanted.includes(o.status))
    .sort((a, b) => b.validTo - a.validTo || a.title.localeCompare(b.title));
}

async function afterChange(offerId: string, actorId: string, deps: OfferDeps): Promise<void> {
  if (!deps.database) await cache.del(ACTIVE_CACHE_KEY);
  await (deps.publish ?? ((e) => bus.publish(e)))({
    type: 'offer.changed',
    offerId,
    at: clock(deps),
    by: actorId,
    teamId: null,
    ownerId: null,
  });
}

function getRow(database: Db, id: string): OfferRow {
  const row = database.select().from(offers).where(eq(offers.id, id)).get();
  if (!row) throw new NotFoundError('Offer');
  return row;
}

function snapshot(row: OfferRow) {
  return { ...row };
}

export async function createOffer(
  input: OfferInput,
  actorId: string,
  deps: OfferDeps = {},
): Promise<OfferDTO> {
  const now = clock(deps);
  const id = ulid();
  const run = (tx: Parameters<Parameters<typeof withTx>[0]>[0]) => {
    const row: OfferRow = {
      id,
      title: input.title,
      description: input.description,
      discountType: input.discountType,
      value: input.discountType === 'GIFT' ? null : (input.value ?? null),
      validFrom: input.validFrom,
      validTo: input.validTo,
      eligibility: input.eligibility,
      isActive: input.isActive,
      createdBy: actorId,
      createdAt: now,
    };
    tx.insert(offers).values(row).run();
    writeAudit(tx, {
      actorId,
      action: 'offer.create',
      entity: 'offer',
      entityId: id,
      after: snapshot(row),
    });
    return row;
  };
  const row = deps.database ? deps.database.transaction(run) : withTx(run);
  await afterChange(id, actorId, deps);
  return toDTO(row, now);
}

export type OfferPatch = Partial<OfferInput>;

export async function updateOffer(
  id: string,
  patch: OfferPatch,
  actorId: string,
  deps: OfferDeps = {},
): Promise<OfferDTO> {
  const now = clock(deps);
  const database = conn(deps);
  const run = (tx: Parameters<Parameters<typeof withTx>[0]>[0]) => {
    const before = getRow(tx as unknown as Db, id);
    const merged: OfferRow = {
      ...before,
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.discountType !== undefined && { discountType: patch.discountType }),
      ...(patch.value !== undefined && { value: patch.value }),
      ...(patch.validFrom !== undefined && { validFrom: patch.validFrom }),
      ...(patch.validTo !== undefined && { validTo: patch.validTo }),
      ...(patch.eligibility !== undefined && { eligibility: patch.eligibility }),
      ...(patch.isActive !== undefined && { isActive: patch.isActive }),
    };
    if (merged.discountType === 'GIFT') merged.value = null;
    const fields: Record<string, string> = {};
    checkValue(merged.discountType, merged.value, (m) => (fields.value = m));
    if (merged.validTo < merged.validFrom) fields.validTo = 'Must not be before start';
    if (merged.title.length < 3 || merged.title.length > 80)
      fields.title = 'Must be 3 to 80 characters';
    if (!OfferEligibilitySchema.safeParse(merged.eligibility).success)
      fields.eligibility = 'Invalid eligibility rules';
    if (Object.keys(fields).length) throw new ValidationError('Offer is invalid', { fields });
    const keys = Object.keys(patch);
    const isToggle = keys.length === 1 && keys[0] === 'isActive';
    tx.update(offers)
      .set({
        title: merged.title,
        description: merged.description,
        discountType: merged.discountType,
        value: merged.value,
        validFrom: merged.validFrom,
        validTo: merged.validTo,
        eligibility: merged.eligibility,
        isActive: merged.isActive,
      })
      .where(eq(offers.id, id))
      .run();
    writeAudit(tx, {
      actorId,
      action: isToggle ? 'offer.toggle' : 'offer.update',
      entity: 'offer',
      entityId: id,
      before: snapshot(before),
      after: snapshot(merged),
    });
    return merged;
  };
  const row = deps.database ? database.transaction(run) : withTx(run);
  await afterChange(id, actorId, deps);
  return toDTO(row, now, appliedStats(database));
}

export function toggleOffer(
  id: string,
  isActive: boolean,
  actorId: string,
  deps: OfferDeps = {},
): Promise<OfferDTO> {
  return updateOffer(id, { isActive }, actorId, deps);
}

export async function deleteOffer(
  id: string,
  actorId: string,
  deps: OfferDeps = {},
): Promise<void> {
  const database = conn(deps);
  const run = (tx: Parameters<Parameters<typeof withTx>[0]>[0]) => {
    const before = getRow(tx as unknown as Db, id);
    const used = tx
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.appliedOfferId, id))
      .get();
    if ((used?.n ?? 0) > 0) throw new OfferInUseError();
    tx.delete(offers).where(eq(offers.id, id)).run();
    writeAudit(tx, {
      actorId,
      action: 'offer.delete',
      entity: 'offer',
      entityId: id,
      before: snapshot(before),
    });
  };
  if (deps.database) database.transaction(run);
  else withTx(run);
  await afterChange(id, actorId, deps);
}

function loadLeadContext(database: Db, leadId: string): OfferLeadContext {
  const row = database
    .select({
      isReturning: customers.isReturning,
      country: customers.country,
      model: leads.vehicleModel,
      hasTradeIn: leads.hasTradeIn,
      wantsFinance: leads.wantsFinance,
      budgetMax: leads.budgetMax,
      budgetMin: leads.budgetMin,
      source: leads.source,
    })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(eq(leads.id, leadId))
    .get();
  if (!row) throw new NotFoundError('Lead');
  return {
    isReturning: row.isReturning,
    country: row.country,
    model: row.model,
    hasTradeIn: row.hasTradeIn,
    wantsFinance: row.wantsFinance,
    budget: row.budgetMax ?? row.budgetMin ?? null,
    source: row.source,
  };
}

/** Active offers the lead is eligible for, with reasons. Authorization is the caller's job. */
export async function getOffersForLead(
  leadId: string,
  deps: OfferDeps = {},
): Promise<LeadOfferDTO[]> {
  const now = clock(deps);
  const ctx = loadLeadContext(conn(deps), leadId);
  const active = await loadEnabledRows(deps);
  const matches: OfferMatch<OfferRow>[] = matchOffers(active, ctx, now);
  return matches.map((m) => ({
    offer: toDTO(m.offer, now),
    reasons: m.reasons,
    endsSoon: m.endsSoon,
  }));
}

/** F07's WON transaction calls this before recording `applied_offer_id`. Never trusts the client. */
export async function validateAppliedOffer(
  leadId: string,
  offerId: string,
  nowOrDeps?: number | OfferDeps,
  extra: OfferDeps = {},
): Promise<OfferRow> {
  const deps: OfferDeps = typeof nowOrDeps === 'object' ? nowOrDeps : extra;
  const at = typeof nowOrDeps === 'number' ? nowOrDeps : clock(deps);
  const database = conn(deps);
  const offer = database.select().from(offers).where(eq(offers.id, offerId)).get();
  if (!offer) throw new OfferNotApplicableError('Offer not found');
  let ctx: OfferLeadContext;
  try {
    ctx = loadLeadContext(database, leadId);
  } catch {
    throw new OfferNotApplicableError('Lead not found');
  }
  if (!matchOffer(offer, ctx, at)) throw new OfferNotApplicableError();
  return offer;
}

/** Activity row F07 inserts inside the WON transaction. */
export function buildOfferAppliedActivity(
  offer: Pick<OfferRow, 'id' | 'title' | 'description' | 'discountType' | 'value'>,
) {
  return {
    kind: 'SYSTEM' as const,
    type: 'OFFER_APPLIED' as const,
    note: `Applied: ${offer.title} (${formatOfferValue(offer)})`,
    metadata: { offerId: offer.id },
  };
}
