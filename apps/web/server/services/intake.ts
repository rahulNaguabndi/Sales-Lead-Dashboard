import { and, desc, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  buildCustomerSearchText,
  OPEN_STAGES,
  scoreLead,
  type Channel,
  type IntakeLead,
  type LeadSource,
  type LeadSummary,
} from '@leaddesk/shared';
import { db, withTx, type Tx } from '../db/client';
import { writeAudit } from '../db/audit';
import { bus } from '../events/bus';
import { ValidationError } from '../http/errors';
import { activities, customers, leads, users } from '../db/schema';
import {
  customerFacts,
  deriveAgeBand,
  findCustomer,
  mergeCustomer,
  nonMobileChannelWarning,
  normalizeEmail,
  normalizePhone,
  type Conn,
  type CustomerFacts,
} from './dedupe';
import { findStickyOwner, pickAssignee, resolveTeam, withTeamLock } from './routing';

export type IntakeContext = { apiKeyName: string; ip: string | null; idempotencyKey?: string };

export type IngestResult = {
  kind: 'created' | 'duplicate';
  reference: string;
  assignedFirstName: string | null;
  expectedContact: { channel: Channel; bestTime: IntakeLead['bestTime'] };
};

const DAY = 24 * 3_600_000;
const IDEMPOTENCY_WINDOW_MS = DAY;
const IMPLICIT_DUPLICATE_MS = 10 * 60_000;

const SOURCE_LABEL: Record<LeadSource, string> = {
  WEBSITE: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  GOOGLE_ADS: 'Google Ads',
  PORTAL: 'Portal',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  REFERRAL: 'Referral',
};

export function formatReference(year: number, seq: number): string {
  return `EDM-${year}-${String(seq).padStart(5, '0')}`;
}

/** Next `EDM-YYYY-NNNNN` for the UTC year of `now` (max + 1; restarts at 1 each year). */
export function nextReference(conn: Conn, now: number): string {
  const year = new Date(now).getUTCFullYear();
  const last = conn
    .select({ reference: leads.reference })
    .from(leads)
    .where(like(leads.reference, `EDM-${year}-%`))
    .orderBy(desc(leads.reference))
    .limit(1)
    .get();
  const seq = last ? Number(last.reference.slice(-5)) + 1 : 1;
  return formatReference(year, seq);
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code?.startsWith('SQLITE_CONSTRAINT') ?? false;
}

function firstNameOf(conn: Conn, ownerId: string | null): string | null {
  if (!ownerId) return null;
  const u = conn.select({ name: users.name }).from(users).where(eq(users.id, ownerId)).get();
  return u ? (u.name.split(' ')[0] ?? null) : null;
}

function duplicateResult(
  conn: Conn,
  lead: typeof leads.$inferSelect,
  input: IntakeLead,
): IngestResult {
  return {
    kind: 'duplicate',
    reference: lead.reference,
    assignedFirstName: firstNameOf(conn, lead.ownerId),
    expectedContact: { channel: input.preferredChannel, bestTime: input.bestTime },
  };
}

function findByIdempotencyKey(key: string, now: number) {
  return db
    .select({ lead: leads })
    .from(activities)
    .innerJoin(leads, eq(leads.id, activities.leadId))
    .where(
      and(
        eq(activities.type, 'LEAD_CREATED'),
        gte(activities.createdAt, now - IDEMPOTENCY_WINDOW_MS),
        sql`json_extract(${activities.metadata}, '$.idempotencyKey') = ${key}`,
      ),
    )
    .limit(1)
    .get()?.lead;
}

function findImplicitDuplicate(customerId: string, model: string | null, now: number) {
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.customerId, customerId),
        inArray(leads.stage, [...OPEN_STAGES]),
        gte(leads.createdAt, now - IMPLICIT_DUPLICATE_MS),
      ),
    )
    .all()
    .find((l) => (l.vehicleModel ?? null) === model);
}

/** Runs the whole intake pipeline. Throws ValidationError for input the schema cannot catch. */
export async function ingest(input: IntakeLead, ctx: IntakeContext): Promise<IngestResult> {
  const now = Date.now();
  const email = input.email ? normalizeEmail(input.email) : null;
  let phone: string | null = null;
  if (input.phone) {
    phone = normalizePhone(input.phone, input.country);
    if (!phone) {
      throw new ValidationError('Request is invalid', {
        fields: { phone: 'Invalid phone number for the selected country' },
      });
    }
  }
  const idempotencyKey = ctx.idempotencyKey ?? input.idempotencyKey;

  if (idempotencyKey) {
    const original = findByIdempotencyKey(idempotencyKey, now);
    if (original) return duplicateResult(db, original, input);
  }

  const match = findCustomer(db, phone, email);
  const vehicleModel = input.vehicleModel ?? null;
  if (match && !idempotencyKey) {
    const recent = findImplicitDuplicate(match.customer.id, vehicleModel, now);
    if (recent) return duplicateResult(db, recent, input);
  }

  const facts: CustomerFacts = match
    ? customerFacts(db, match.customer.id, now)
    : { isReturning: false, hasRecentPurchase: false, lastPurchaseAt: null };
  const sticky = match ? findStickyOwner(db, match.customer.id, now) : null;
  const scored = scoreLead(
    {
      testDriveRequested: input.testDriveRequested,
      wantsFinance: input.wantsFinance,
      hasTradeIn: input.hasTradeIn,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      vehicleModel,
      message: input.message ?? null,
      source: input.source,
      isReturning: facts.isReturning,
      lastPurchaseAt: facts.lastPurchaseAt,
      createdAt: now,
      lastPositiveOutcome: null,
      unansweredAttempts: 0,
    },
    now,
  );
  const team = await resolveTeam(db, input.country, sticky);
  const channelWarning = nonMobileChannelWarning(phone, input.preferredChannel);

  const write = (tx: Tx) => {
    const ageBand = input.ageBand !== 'UNKNOWN' ? input.ageBand : deriveAgeBand(input.age);
    let customerId: string;
    if (match) {
      customerId = match.customer.id;
      mergeCustomer(
        tx,
        match.customer,
        {
          phone,
          email,
          city: input.city,
          age: input.age,
          ageBand,
          language: input.language,
          preferredChannel: input.preferredChannel,
          secondaryChannel: input.secondaryChannel,
          bestTime: input.bestTime,
          marketingConsent: input.marketingConsent,
        },
        facts.isReturning,
      );
    } else {
      customerId = ulid();
      tx.insert(customers)
        .values({
          id: customerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone,
          country: input.country,
          city: input.city ?? null,
          age: input.age ?? null,
          ageBand,
          language: input.language,
          preferredChannel: input.preferredChannel,
          secondaryChannel: input.secondaryChannel ?? null,
          bestTime: input.bestTime,
          isReturning: false,
          marketingConsent: input.marketingConsent,
          searchText: buildCustomerSearchText({
            firstName: input.firstName,
            lastName: input.lastName,
            email,
            phone,
          }),
          createdAt: now,
        })
        .run();
    }

    const assignment = pickAssignee(tx, team.teamId, {
      language: input.language,
      stickyOwnerId: sticky?.userId ?? null,
      now,
    });
    const leadId = ulid();
    const reference = nextReference(tx, now);
    tx.insert(leads)
      .values({
        id: leadId,
        reference,
        customerId,
        teamId: team.teamId,
        ownerId: assignment.ownerId,
        source: input.source,
        sourceDetail: input.sourceDetail ?? null,
        stage: 'NEW',
        vehicleModel,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        hasTradeIn: input.hasTradeIn,
        wantsFinance: input.wantsFinance,
        testDriveRequested: input.testDriveRequested,
        message: input.message ?? null,
        score: scored.score,
        priority: scored.priority,
        scoreBreakdown: scored.breakdown,
        assignedAt: assignment.ownerId ? now : null,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
      .run();

    const where = [input.city, input.country].filter(Boolean).join(', ');
    const poolNote =
      assignment.unassignedReason === 'all_at_capacity'
        ? ' · Auto-assign skipped: all reps at capacity'
        : '';
    tx.insert(activities)
      .values({
        id: ulid(),
        leadId,
        actorId: null,
        kind: 'SYSTEM',
        type: 'LEAD_CREATED',
        note: `Lead created from ${SOURCE_LABEL[input.source]} · ${where}${poolNote}`,
        metadata: {
          source: input.source,
          city: input.city ?? null,
          country: input.country,
          routing: team.routing,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          ...(match?.emailConflictId
            ? { dedupeConflict: { emailCustomerId: match.emailConflictId } }
            : {}),
          ...(assignment.unassignedReason ? { unassignedReason: assignment.unassignedReason } : {}),
          ...(channelWarning ? { channelWarning: 'preferred channel needs a mobile number' } : {}),
        },
        createdAt: now,
      })
      .run();

    let ownerName: string | null = null;
    if (assignment.ownerId) {
      ownerName =
        tx.select({ n: users.name }).from(users).where(eq(users.id, assignment.ownerId)).get()?.n ??
        null;
      tx.insert(activities)
        .values({
          id: ulid(),
          leadId,
          actorId: null,
          kind: 'SYSTEM',
          type: 'ASSIGNED',
          note: `Auto-assigned to ${ownerName} · ${assignment.reason}`,
          metadata: {
            method: 'AUTO',
            strategy: assignment.strategy,
            reason: assignment.reason,
            openCount: assignment.openCount,
          },
          createdAt: now,
        })
        .run();
    }

    writeAudit(tx, {
      actorId: null,
      action: 'lead.intake',
      entity: 'lead',
      entityId: leadId,
      after: { reference, teamId: team.teamId, ownerId: assignment.ownerId, source: input.source },
      ip: ctx.ip,
      meta: { apiKeyName: ctx.apiKeyName, actorType: 'intake' },
    });
    return { leadId, reference, assignment, ownerName };
  };

  const committed = await withTeamLock(team.teamId, () => {
    try {
      return withTx(write);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return withTx(write); // reference collision: retry once with a fresh max
    }
  });

  await publish(committed, input, team.teamId, facts.isReturning, scored, now);
  console.info(
    JSON.stringify({
      level: 'info',
      msg: 'lead_intake',
      reference: committed.reference,
      apiKey: ctx.apiKeyName,
    }),
  );

  return {
    kind: 'created',
    reference: committed.reference,
    assignedFirstName: committed.ownerName ? (committed.ownerName.split(' ')[0] ?? null) : null,
    expectedContact: { channel: input.preferredChannel, bestTime: input.bestTime },
  };
}

async function publish(
  c: {
    leadId: string;
    reference: string;
    assignment: ReturnType<typeof pickAssignee>;
    ownerName: string | null;
  },
  input: IntakeLead,
  teamId: string,
  isReturning: boolean,
  scored: { priority: LeadSummary['priority']; score: number },
  now: number,
): Promise<void> {
  try {
    const ownerId = c.assignment.ownerId;
    const summary: LeadSummary = {
      id: c.leadId,
      reference: c.reference,
      customerName: `${input.firstName} ${input.lastName}`,
      vehicleModel: input.vehicleModel ?? null,
      source: input.source,
      stage: 'NEW',
      priority: scored.priority,
      score: scored.score,
      ownerId,
      ownerName: c.ownerName,
      teamId,
      createdAt: now,
      lastActivityAt: now,
      nextFollowUpAt: null,
      isReturning,
      slaStatus: null,
    };
    await bus.publish({ type: 'lead.created', lead: summary, teamId, ownerId, by: null, at: now });
    if (ownerId) {
      // strategy/reason extend the shared event type (see specs/010-*/research.md "Requires F01 change").
      const assigned = {
        type: 'lead.assigned' as const,
        leadId: c.leadId,
        fromOwnerId: null,
        toOwnerId: ownerId,
        method: 'AUTO' as const,
        strategy: c.assignment.strategy,
        reason: c.assignment.reason,
        teamId,
        ownerId,
        by: null,
        at: now,
      };
      await bus.publish(assigned);
    }
  } catch (err) {
    console.warn('[intake] event publish failed:', (err as Error).message);
  }
}
