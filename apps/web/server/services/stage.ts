import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import {
  OPEN_STAGES,
  STAGE_LABELS,
  canTransition,
  formatEUR,
  type LeadDeskEvent,
  type LostReason,
  type Priority,
  type Stage,
  type StageActor,
  type StageChange,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, withTx, type Db, type Tx } from '../db/client';
import {
  activities,
  auditLog,
  customers,
  followUps,
  leads,
  offers,
  purchases,
  stageHistory,
  users,
} from '../db/schema';
import { bus } from '../events/bus';
import { cache } from '../cache/cache';
import { AppError, NotFoundError } from '../http/errors';
import { authorize } from '../policy/authorize';
import { leadScopeWhere } from '../policy/lead-filter';
import { getScope } from '../policy/scope';
import type { CurrentUser } from '../policy/types';
import { recomputeLeadScore } from './scoring';

const newId = monotonicFactory();

/* ------------------------------------------------------------------ errors */

export class InvalidTransitionError extends AppError {
  readonly statusCode = 422;
  readonly code = 'INVALID_TRANSITION';
}
export class OfferNotApplicableError extends AppError {
  readonly statusCode = 422;
  readonly code = 'OFFER_NOT_APPLICABLE';
}
export class StageValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = 'VALIDATION';
}
export class VersionConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'VERSION_CONFLICT';
  constructor(
    readonly current: LeadRow,
    readonly updatedBy: string | null,
  ) {
    super(`This lead was updated by ${updatedBy ?? 'someone else'}. Refreshed.`);
  }
}

/* ------------------------------------------------------------------- types */

type LeadRow = typeof leads.$inferSelect;
type ActivityRow = typeof activities.$inferSelect;

type WithOptionalVersion<T> = T extends unknown ? Omit<T, 'version'> & { version?: number } : never;
/** Stage change request. `version` is required for user calls and optional for system calls. */
export type TransitionInput = WithOptionalVersion<StageChange>;

export type TransitionCtx = {
  /** The acting user, or null for system callers (F08 auto-COLD, F06 revive): no authorization. */
  user: CurrentUser | null;
  /** Run inside the caller's transaction; events are then NOT published (call `publish`). */
  tx?: Tx;
  now?: number;
  ip?: string | null;
  publish?: (e: LeadDeskEvent) => Promise<void> | void;
};

export type TransitionResult = {
  lead: LeadRow;
  activities: ActivityRow[];
  changed: boolean;
  /** Announce after the outer transaction commits. Already invoked when the service owns the tx. */
  publish: () => Promise<void>;
};

const CLOSED: readonly Stage[] = ['WON', 'LOST'];

/** Local stand-in for F15 `matchOffers`: the offer must exist, be active and be inside its window. */
function checkOfferApplicable(tx: Tx, offerId: string, now: number) {
  const o = tx.select().from(offers).where(eq(offers.id, offerId)).get();
  if (!o || !o.isActive || o.validFrom > now || o.validTo < now) {
    throw new OfferNotApplicableError('This offer no longer applies to the lead');
  }
  return o;
}

function lastEditorName(tx: Tx, leadId: string): string | null {
  const row = tx
    .select({ name: users.name })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entity, 'lead'), eq(auditLog.entityId, leadId)))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(1)
    .get();
  return row?.name ?? null;
}

/* ----------------------------------------------------------------- service */

/**
 * The single write path for stage changes (FR-001…FR-011). One transaction, optimistic
 * concurrency on `version`, events published after commit.
 */
export async function transition(
  ctx: TransitionCtx,
  leadId: string,
  input: TransitionInput,
): Promise<TransitionResult> {
  const now = ctx.now ?? Date.now();
  const user = ctx.user;

  const probe = (ctx.tx ?? db).select().from(leads).where(eq(leads.id, leadId)).get();
  if (!probe) throw new NotFoundError('lead');

  if (user) {
    const resource = {
      kind: 'lead' as const,
      lead: { id: probe.id, ownerId: probe.ownerId, teamId: probe.teamId, stage: probe.stage },
    };
    await authorize(user, 'lead:changeStage', resource);
    if (probe.stage === 'LOST' && input.to !== 'LOST') {
      await authorize(user, 'lead:reopen', resource);
    }
    if (input.version === undefined) throw new StageValidationError('version is required');
  }
  const actor: StageActor = user ? user.role : 'SYSTEM';

  const run = (tx: Tx) => apply(tx, user, actor, leadId, input, now, ctx.ip ?? null);
  const out = ctx.tx ? run(ctx.tx) : withTx(run);

  const publish = async () => {
    if (!out.changed) return;
    const fn = ctx.publish ?? ((e: LeadDeskEvent) => bus.publish(e));
    const base = {
      at: Date.now(),
      teamId: out.lead.teamId,
      ownerId: out.lead.ownerId,
      by: user?.id ?? null,
    };
    try {
      for (const a of out.activities) {
        await fn({
          ...base,
          type: 'activity.created',
          leadId,
          activity: {
            id: a.id,
            leadId,
            actorId: a.actorId,
            actorName: a.actorId && user && a.actorId === user.id ? user.name : null,
            kind: a.kind,
            type: a.type,
            outcome: a.outcome,
            note: a.note,
            aiAssisted: a.aiAssisted,
            metadata: a.metadata,
            createdAt: a.createdAt,
          },
        });
      }
      const changes: { stage: Stage; score?: number; priority?: Priority } = {
        stage: out.lead.stage,
      };
      if (out.before.score !== out.lead.score) changes.score = out.lead.score;
      if (out.before.priority !== out.lead.priority) changes.priority = out.lead.priority;
      await fn({ ...base, type: 'lead.updated', leadId, changes });
      await cache.delByPrefix('dash:');
    } catch (err) {
      console.warn('[stage] event publish failed:', (err as Error).message);
    }
  };

  if (!ctx.tx) await publish();
  return { lead: out.lead, activities: out.activities, changed: out.changed, publish };
}

type Applied = { lead: LeadRow; before: LeadRow; activities: ActivityRow[]; changed: boolean };

function apply(
  tx: Tx,
  user: CurrentUser | null,
  actor: StageActor,
  leadId: string,
  input: TransitionInput,
  now: number,
  ip: string | null,
): Applied {
  const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new NotFoundError('lead');
  const from = lead.stage;
  const to = input.to;

  if (input.version !== undefined && input.version !== lead.version) {
    throw new VersionConflictError(lead, lastEditorName(tx, leadId));
  }
  if (from === to) return { lead, before: lead, activities: [], changed: false };
  if (!canTransition(from, to, actor)) {
    throw new InvalidTransitionError(`Not allowed from ${STAGE_LABELS[from]}`);
  }

  const rows: ActivityRow[] = [];
  const addSystem = (type: ActivityRow['type'], note: string, metadata: Record<string, unknown>) => {
    const row: ActivityRow = {
      id: newId(),
      leadId,
      actorId: user?.id ?? null,
      kind: 'SYSTEM',
      type,
      outcome: null,
      note,
      aiAssisted: false,
      metadata,
      createdAt: now,
    };
    tx.insert(activities).values(row).run();
    rows.push(row);
  };

  const meta: Record<string, unknown> = { from, to };
  let note = `Stage changed ${from} → ${to}`;
  const set: Partial<typeof leads.$inferInsert> = {
    stage: to,
    updatedAt: now,
    version: lead.version + 1,
  };
  let reason: string | null = 'reason' in input && input.reason ? input.reason : null;
  let offer: { id: string; title: string } | null = null;

  if (to === 'WON') {
    const w = input as Extract<TransitionInput, { to: 'WON' }>;
    if (!w.dealValue || w.dealValue <= 0) throw new StageValidationError('dealValue is required');
    if (w.appliedOfferId) {
      const o = checkOfferApplicable(tx, w.appliedOfferId, now);
      offer = { id: o.id, title: o.title };
    }
    const model = w.vehicleModel ?? lead.vehicleModel ?? 'unknown';
    set.dealValue = w.dealValue;
    set.appliedOfferId = offer?.id ?? null;
    set.closedAt = now;
    meta.dealValue = w.dealValue;
    meta.vehicleModel = model;
    note = `Won · ${formatEUR(w.dealValue)} · ${model}`;
    tx.insert(purchases)
      .values({
        id: newId(),
        customerId: lead.customerId,
        leadId,
        vehicleModel: model,
        amount: w.dealValue,
        purchasedAt: now,
      })
      .run();
    tx.update(customers).set({ isReturning: true }).where(eq(customers.id, lead.customerId)).run();
  } else if (to === 'LOST') {
    const l = input as Extract<TransitionInput, { to: 'LOST' }>;
    if (!l.lostReason) throw new StageValidationError('lostReason is required');
    const lostNote = l.lostNote?.trim() || null;
    if (l.lostReason === 'OTHER' && (lostNote ?? '').length < 3) {
      throw new StageValidationError('A note is required for reason OTHER');
    }
    set.lostReason = l.lostReason as LostReason;
    set.lostNote = lostNote;
    set.closedAt = now;
    meta.lostReason = l.lostReason;
    note = `Lost · ${l.lostReason.toLowerCase().replace(/_/g, ' ')}`;
  } else if (from === 'LOST') {
    set.closedAt = null;
    set.lostReason = null;
    set.lostNote = null;
    meta.reopened = true;
    reason = reason ?? 'reopen';
    note = 'Reopened';
  }
  if (from === 'COLD' && to === 'CONTACTED') {
    set.attemptCount = 0;
    meta.revived = true;
    reason = reason ?? 'auto:revive';
  }
  if (reason) meta.reason = reason;

  const res = tx
    .update(leads)
    .set(set)
    .where(and(eq(leads.id, leadId), eq(leads.version, lead.version)))
    .run();
  if (res.changes !== 1) throw new VersionConflictError(lead, lastEditorName(tx, leadId));

  tx.insert(stageHistory)
    .values({
      id: newId(),
      leadId,
      fromStage: from,
      toStage: to,
      changedBy: user?.id ?? null,
      reason,
      changedAt: now,
    })
    .run();
  addSystem('STAGE_CHANGED', note, meta);
  if (offer) {
    addSystem('OFFER_APPLIED', `Offer applied: ${offer.title}`, {
      offerId: offer.id,
      title: offer.title,
    });
  }

  if (CLOSED.includes(to)) {
    tx.update(followUps)
      .set({ status: 'CANCELLED' })
      .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'PENDING')))
      .run();
  }

  // F09 score recompute; it writes SCORE_CHANGED itself when the priority band moves.
  recomputeLeadScore(tx, leadId, now);
  rows.push(
    ...tx
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.leadId, leadId),
          eq(activities.type, 'SCORE_CHANGED'),
          eq(activities.createdAt, now),
        ),
      )
      .all(),
  );

  const after = tx.select().from(leads).where(eq(leads.id, leadId)).get()!;
  const pick = (l: LeadRow) => ({
    stage: l.stage,
    dealValue: l.dealValue,
    lostReason: l.lostReason,
    closedAt: l.closedAt,
    version: l.version,
  });
  writeAudit(tx, {
    actorId: user?.id ?? null,
    action: 'lead.stage',
    entity: 'lead',
    entityId: leadId,
    before: pick(lead),
    after: pick(after),
    ip,
  });
  return { lead: after, before: lead, activities: rows, changed: true };
}

/* ---------------------------------------------------------------- pipeline */

export const PIPELINE_COLUMN_CAP = 200;
export const PIPELINE_CLOSED_WINDOW_MS = 30 * 24 * 3_600_000;
export const PIPELINE_STAGES: readonly Stage[] = [...OPEN_STAGES, 'WON', 'LOST', 'COLD'];

export type PipelineCard = {
  id: string;
  reference: string;
  customerName: string;
  vehicleModel: string | null;
  priority: Priority;
  score: number;
  stage: Stage;
  version: number;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  budgetMax: number | null;
  dealValue: number | null;
  daysInStage: number;
};
export type PipelineColumn = {
  stage: Stage;
  count: number;
  valueCents: number;
  more: number;
  leads: PipelineCard[];
};
export type PipelineFilters = { owner?: string[]; source?: string[]; priority?: string[] };

export async function listPipeline(
  user: CurrentUser,
  filters: PipelineFilters = {},
  deps: { db?: Db; now?: number } = {},
): Promise<{ columns: PipelineColumn[] }> {
  const database = deps.db ?? db;
  const now = deps.now ?? Date.now();
  const scope = await getScope(user.id);
  const where = [leadScopeWhere(scope)];
  if (filters.owner?.length) where.push(inArray(leads.ownerId, filters.owner));
  if (filters.source?.length) where.push(inArray(leads.source, filters.source as never));
  if (filters.priority?.length) where.push(inArray(leads.priority, filters.priority as never));
  const base = and(...where);

  const columns: PipelineColumn[] = [];
  for (const stage of PIPELINE_STAGES) {
    const closed = CLOSED.includes(stage);
    const cond = and(
      base,
      eq(leads.stage, stage),
      closed ? gte(leads.closedAt, now - PIPELINE_CLOSED_WINDOW_MS) : undefined,
    );
    const valueCol = stage === 'WON' ? leads.dealValue : leads.budgetMax;
    const agg = database
      .select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${valueCol}), 0)` })
      .from(leads)
      .where(cond)
      .get()!;
    const rows = database
      .select({
        id: leads.id,
        reference: leads.reference,
        first: customers.firstName,
        last: customers.lastName,
        vehicleModel: leads.vehicleModel,
        priority: leads.priority,
        score: leads.score,
        version: leads.version,
        ownerId: leads.ownerId,
        ownerName: users.name,
        ownerColor: users.avatarColor,
        budgetMax: leads.budgetMax,
        dealValue: leads.dealValue,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .leftJoin(users, eq(users.id, leads.ownerId))
      .where(cond)
      .orderBy(desc(leads.score), desc(leads.updatedAt))
      .limit(PIPELINE_COLUMN_CAP)
      .all();
    const since = new Map<string, number>();
    if (rows.length) {
      const hist = database
        .select({ leadId: stageHistory.leadId, at: sql<number>`max(${stageHistory.changedAt})` })
        .from(stageHistory)
        .where(
          and(
            inArray(
              stageHistory.leadId,
              rows.map((r) => r.id),
            ),
            eq(stageHistory.toStage, stage),
          ),
        )
        .groupBy(stageHistory.leadId)
        .all();
      for (const h of hist) since.set(h.leadId, h.at);
    }
    columns.push({
      stage,
      count: agg.n,
      valueCents: agg.v,
      more: Math.max(0, agg.n - rows.length),
      leads: rows.map((r) => ({
        id: r.id,
        reference: r.reference,
        customerName: `${r.first} ${r.last}`,
        vehicleModel: r.vehicleModel,
        priority: r.priority,
        score: r.score,
        stage,
        version: r.version,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        ownerColor: r.ownerColor,
        budgetMax: r.budgetMax,
        dealValue: r.dealValue,
        daysInStage: Math.max(0, Math.floor((now - (since.get(r.id) ?? r.updatedAt)) / 86_400_000)),
      })),
    });
  }
  return { columns };
}
