import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { VEHICLES } from '@leaddesk/shared';
import { db, type Db } from '../db/client';
import { activities, customers, followUps, leads, purchases, teams, users } from '../db/schema';
import { NotFoundError, ValidationError } from '../http/errors';
import { authorize, can, resolveScope } from '../policy';
import type { CurrentUser, LeadResource } from '../policy';
import type {
  ActivityItem,
  ActivityKindFilter,
  ActivityOrder,
  ActivityPage,
  LeadDetail,
  LeadPermissions,
} from '@/components/leads/detail/types';
import { decodeCursor, encodeCursor } from '@/components/timeline/cursor';

export type LeadDetailDeps = { database?: Db };

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const NOT_FOUND = 'Lead';

function warnOutOfScope(userId: string, leadId: string): void {
  // Ids only, no PII.
  process.stdout.write(
    `${JSON.stringify({ level: 'warn', message: 'lead read denied', userId, leadId })}\n`,
  );
}

/** Loads the lead and checks lead:read. Missing, malformed and out-of-scope ids all throw the same NotFoundError. */
async function loadReadableLead(user: CurrentUser, id: string, database: Db) {
  if (!ULID_RE.test(id)) throw new NotFoundError(NOT_FOUND);
  const lead = database.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) throw new NotFoundError(NOT_FOUND);
  const scope = await resolveScope(user.id, database);
  try {
    await authorize(user, 'lead:read', { kind: 'lead', lead }, { scope, database });
  } catch (err) {
    if (err instanceof NotFoundError || (err as { statusCode?: number }).statusCode === 403) {
      warnOutOfScope(user.id, id);
      throw new NotFoundError(NOT_FOUND);
    }
    throw err;
  }
  return { lead, scope };
}

export async function getLeadDetail(
  user: CurrentUser,
  id: string,
  deps: LeadDetailDeps = {},
): Promise<LeadDetail> {
  const database = deps.database ?? db;
  const { lead, scope } = await loadReadableLead(user, id, database);
  const authDeps = { scope, database };

  const customer = database.select().from(customers).where(eq(customers.id, lead.customerId)).get();
  if (!customer) throw new NotFoundError(NOT_FOUND);
  const owner = lead.ownerId
    ? (database.select().from(users).where(eq(users.id, lead.ownerId)).get() ?? null)
    : null;
  const team = database.select().from(teams).where(eq(teams.id, lead.teamId)).get();

  const prev = database
    .select()
    .from(leads)
    .where(and(eq(leads.customerId, lead.customerId), ne(leads.id, lead.id)))
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .all();
  const previousLeads = [];
  for (const p of prev) {
    previousLeads.push({
      id: p.id,
      reference: p.reference,
      vehicleModel: p.vehicleModel,
      stage: p.stage,
      createdAt: p.createdAt,
      canView: await can(user, 'lead:read', { kind: 'lead', lead: p }, authDeps),
    });
  }
  const bought = database
    .select()
    .from(purchases)
    .where(eq(purchases.customerId, lead.customerId))
    .orderBy(desc(purchases.purchasedAt))
    .all();

  const pending = and(eq(followUps.leadId, lead.id), eq(followUps.status, 'PENDING'));
  const nextFollowUp = database
    .select()
    .from(followUps)
    .where(pending)
    .orderBy(asc(followUps.dueAt))
    .limit(1)
    .get();
  const pendingCount =
    database.select({ n: sql<number>`count(*)` }).from(followUps).where(pending).get()?.n ?? 0;

  const res: LeadResource = { kind: 'lead', lead };
  const permissions: LeadPermissions = {
    canRead: true,
    canLogActivity: await can(user, 'lead:write', { ...res, activityType: 'NOTE' }, authDeps),
    canChangeStage: await can(user, 'lead:write', res, authDeps),
    canAssign: await can(user, 'lead:assign', { ...res, targetUser: null }, authDeps),
    canClaim: await can(user, 'lead:claim', res, authDeps),
  };

  const vehicle = VEHICLES.find((v) => v.slug === lead.vehicleModel);

  return {
    lead: {
      id: lead.id,
      reference: lead.reference,
      stage: lead.stage,
      source: lead.source,
      sourceDetail: lead.sourceDetail,
      vehicleModel: lead.vehicleModel,
      vehicleName: vehicle?.name ?? lead.vehicleModel,
      vehiclePrice: vehicle?.priceCents ?? null,
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      hasTradeIn: lead.hasTradeIn,
      wantsFinance: lead.wantsFinance,
      testDriveRequested: lead.testDriveRequested,
      message: lead.message,
      score: lead.score,
      priority: lead.priority,
      scoreBreakdown: lead.scoreBreakdown,
      ownerId: lead.ownerId,
      teamId: lead.teamId,
      lostReason: lead.lostReason,
      lostNote: lead.lostNote,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      lastActivityAt: lead.lastActivityAt,
      version: lead.version,
    },
    customer: {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      country: customer.country,
      city: customer.city,
      ageBand: customer.ageBand,
      language: customer.language,
      preferredChannel: customer.preferredChannel,
      secondaryChannel: customer.secondaryChannel,
      bestTime: customer.bestTime,
      isReturning: customer.isReturning,
    },
    owner: owner
      ? { id: owner.id, name: owner.name, avatarColor: owner.avatarColor, isActive: owner.isActive }
      : null,
    team: { id: lead.teamId, name: team?.name ?? lead.teamId },
    history: {
      previousLeads,
      purchases: bought.map((b) => ({
        vehicleModel: b.vehicleModel,
        amount: b.amount,
        purchasedAt: b.purchasedAt,
      })),
    },
    followUps: {
      next: nextFollowUp
        ? { id: nextFollowUp.id, dueAt: nextFollowUp.dueAt, note: nextFollowUp.note }
        : null,
      pendingCount,
    },
    permissions,
  };
}

export type ListActivitiesOptions = {
  order?: ActivityOrder;
  kind?: ActivityKindFilter;
  limit?: number;
  cursor?: string | null;
};

export async function listActivities(
  user: CurrentUser,
  leadId: string,
  opts: ListActivitiesOptions = {},
  deps: LeadDetailDeps = {},
): Promise<ActivityPage> {
  const database = deps.database ?? db;
  await loadReadableLead(user, leadId, database);

  const order = opts.order ?? 'desc';
  const kind = opts.kind ?? 'ALL';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  const conds = [eq(activities.leadId, leadId)];
  if (kind !== 'ALL') conds.push(eq(activities.kind, kind));
  if (opts.cursor) {
    const c = decodeCursor(opts.cursor);
    if (!c) throw new ValidationError('Invalid cursor', { fields: { cursor: 'Invalid cursor' } });
    const cmp = order === 'desc' ? sql`<` : sql`>`;
    conds.push(
      or(
        sql`${activities.createdAt} ${cmp} ${c.createdAt}`,
        and(eq(activities.createdAt, c.createdAt), sql`${activities.id} ${cmp} ${c.id}`),
      )!,
    );
  }
  const dir = order === 'desc' ? desc : asc;
  const rows = database
    .select()
    .from(activities)
    .where(and(...conds))
    .orderBy(dir(activities.createdAt), dir(activities.id))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const actorIds = [...new Set(page.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actorRows = actorIds.length
    ? database.select().from(users).where(inArray(users.id, actorIds)).all()
    : [];
  const actors = new Map(actorRows.map((a) => [a.id, a]));

  const items: ActivityItem[] = page.map((r) => {
    const a = r.actorId ? actors.get(r.actorId) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      type: r.type,
      outcome: r.outcome,
      note: r.note === '' ? null : r.note,
      actor: a ? { id: a.id, name: a.name, avatarColor: a.avatarColor, isActive: a.isActive } : null,
      aiAssisted: r.aiAssisted,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt,
    };
  });
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
