import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import {
  FOLLOW_UP_MAX_AHEAD_MS,
  FOLLOW_UP_PAST_TOLERANCE_MS,
  OPEN_STAGES,
  type ActivityDTO,
  type Channel,
  type CreateFollowUp,
  type FollowUpView,
  type LeadDeskEvent,
  type PatchFollowUp,
  type Priority,
  type Stage,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, withTx, type Tx } from '../db/client';
import { activities, customers, followUps, leads } from '../db/schema';
import { bus } from '../events/bus';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../http/errors';
import { authorize } from '../policy/authorize';
import { getScope } from '../policy/scope';
import type { CurrentUser } from '../policy/types';
import { endOfDay } from './lead-query.rank';

const newId = monotonicFactory();

type FollowUpRow = typeof followUps.$inferSelect;
type ActivityRow = typeof activities.$inferSelect;
type LeadRow = typeof leads.$inferSelect;

export type FollowUpAction =
  | 'scheduled'
  | 'superseded'
  | 'snoozed'
  | 'done_without_activity'
  | 'cancelled'
  | 'missed';

export type FollowUpOpts = {
  now?: number;
  publish?: (e: LeadDeskEvent) => Promise<void> | void;
};

export type FollowUpDTO = {
  id: string;
  leadId: string;
  assignedTo: string;
  dueAt: number;
  status: FollowUpRow['status'];
  note: string | null;
  createdBy: string | null;
  createdAt: number;
  completedAt: number | null;
  completedByActivityId: string | null;
};

export const toFollowUpDTO = (r: FollowUpRow): FollowUpDTO => ({
  id: r.id,
  leadId: r.leadId,
  assignedTo: r.assignedTo,
  dueAt: r.dueAt,
  status: r.status,
  note: r.note,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  completedAt: r.completedAt,
  completedByActivityId: r.completedByActivityId,
});

function formatDue(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/** Follow-up system entries reuse the FOLLOW_UP_* types, told apart by `metadata.action`. */
export function addFollowUpActivity(
  tx: Tx,
  o: {
    leadId: string;
    type: 'FOLLOW_UP_SCHEDULED' | 'FOLLOW_UP_MISSED';
    action: FollowUpAction;
    note: string;
    now: number;
    metadata?: Record<string, unknown>;
  },
): ActivityRow {
  const row: ActivityRow = {
    id: newId(),
    leadId: o.leadId,
    actorId: null,
    kind: 'SYSTEM',
    type: o.type,
    outcome: null,
    note: o.note,
    aiAssisted: false,
    metadata: { action: o.action, ...o.metadata },
    createdAt: o.now,
  };
  tx.insert(activities).values(row).run();
  return row;
}

const isOpenStage = (s: Stage) => (OPEN_STAGES as readonly Stage[]).includes(s);

export function assertDueAt(dueAt: number, now: number): void {
  if (!Number.isFinite(dueAt) || dueAt <= now - FOLLOW_UP_PAST_TOLERANCE_MS) {
    throw new ValidationError('Pick a future time', { fields: { dueAt: 'Pick a future time' } });
  }
  if (dueAt > now + FOLLOW_UP_MAX_AHEAD_MS) {
    throw new ValidationError('Follow-up is too far ahead (max 90 days)', {
      fields: { dueAt: 'Follow-up is too far ahead (max 90 days)' },
    });
  }
}

/* ------------------------------------------------------------ in-transaction */

export type CreateInTxInput = {
  lead: Pick<LeadRow, 'id' | 'ownerId' | 'stage'>;
  actorId: string;
  dueAt: number;
  note?: string | null;
  now: number;
  metadata?: Record<string, unknown>;
};

/** Supersede + insert + activity + audit. Runs inside the caller's transaction (F06 composer too). */
export function createInTx(
  tx: Tx,
  i: CreateInTxInput,
): { followUp: FollowUpRow; activities: ActivityRow[] } {
  const assignee = i.lead.ownerId ?? i.actorId;
  const out: ActivityRow[] = [];
  const existing = tx
    .select()
    .from(followUps)
    .where(
      and(
        eq(followUps.leadId, i.lead.id),
        eq(followUps.assignedTo, assignee),
        eq(followUps.status, 'PENDING'),
      ),
    )
    .all();
  for (const old of existing) {
    tx.update(followUps)
      .set({ status: 'CANCELLED', note: 'Superseded' })
      .where(eq(followUps.id, old.id))
      .run();
    out.push(
      addFollowUpActivity(tx, {
        leadId: i.lead.id,
        type: 'FOLLOW_UP_SCHEDULED',
        action: 'superseded',
        note: 'Follow-up superseded by a new one',
        now: i.now,
        metadata: { followUpId: old.id, ...i.metadata },
      }),
    );
  }
  const followUp: FollowUpRow = {
    id: newId(),
    leadId: i.lead.id,
    assignedTo: assignee,
    dueAt: i.dueAt,
    status: 'PENDING',
    note: i.note ?? null,
    createdBy: i.actorId,
    createdAt: i.now,
    completedAt: null,
    completedByActivityId: null,
  };
  tx.insert(followUps).values(followUp).run();
  out.push(
    addFollowUpActivity(tx, {
      leadId: i.lead.id,
      type: 'FOLLOW_UP_SCHEDULED',
      action: 'scheduled',
      note: `Follow-up scheduled for ${formatDue(i.dueAt)}`,
      now: i.now,
      metadata: { followUpId: followUp.id, dueAt: i.dueAt, ...i.metadata },
    }),
  );
  writeAudit(tx, {
    actorId: i.actorId,
    action: 'follow_up.create',
    entity: 'follow_up',
    entityId: followUp.id,
    after: { leadId: i.lead.id, assignedTo: assignee, dueAt: i.dueAt },
  });
  return { followUp, activities: out };
}

/** Marks a follow-up DONE and links it to the activity that completed it. */
export function completeInTx(
  tx: Tx,
  followUpId: string,
  leadId: string,
  activityId: string | null,
  now: number,
  actorId: string | null = null,
): FollowUpRow {
  const f = tx.select().from(followUps).where(eq(followUps.id, followUpId)).get();
  if (!f || f.leadId !== leadId) throw new NotFoundError('follow-up');
  if (f.status !== 'PENDING') throw new ConflictError('Follow-up is no longer pending');
  tx.update(followUps)
    .set({ status: 'DONE', completedAt: now, completedByActivityId: activityId })
    .where(eq(followUps.id, f.id))
    .run();
  writeAudit(tx, {
    actorId,
    action: 'follow_up.complete',
    entity: 'follow_up',
    entityId: f.id,
    before: { status: f.status },
    after: { status: 'DONE' },
  });
  return { ...f, status: 'DONE', completedAt: now, completedByActivityId: activityId };
}

/** Cancels every PENDING follow-up on a lead (F07 calls this when a lead closes). */
export function cancelAllForLead(tx: Tx, leadId: string, now: number, note = 'Lead closed'): number {
  const rows = tx
    .select()
    .from(followUps)
    .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'PENDING')))
    .all();
  for (const r of rows) {
    tx.update(followUps).set({ status: 'CANCELLED', note }).where(eq(followUps.id, r.id)).run();
    addFollowUpActivity(tx, {
      leadId,
      type: 'FOLLOW_UP_SCHEDULED',
      action: 'cancelled',
      note: `Follow-up cancelled: ${note}`,
      now,
      metadata: { followUpId: r.id },
    });
  }
  return rows.length;
}

/** FR-003: moves PENDING follow-ups to the new owner (F11 calls this on reassignment). */
export function reassignPending(tx: Tx, leadId: string, toUserId: string): number {
  const res = tx
    .update(followUps)
    .set({ assignedTo: toUserId })
    .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'PENDING')))
    .run();
  return res.changes;
}

/* ------------------------------------------------------------------ service */

function toActivityDTO(r: ActivityRow): ActivityDTO {
  return {
    id: r.id,
    leadId: r.leadId,
    actorId: r.actorId,
    actorName: null,
    kind: r.kind,
    type: r.type,
    outcome: r.outcome,
    note: r.note,
    aiAssisted: r.aiAssisted,
    metadata: r.metadata,
    createdAt: r.createdAt,
  };
}

/** Publishes after commit; never throws. */
export async function announce(
  lead: Pick<LeadRow, 'id' | 'teamId' | 'ownerId'>,
  by: string | null,
  rows: ActivityRow[],
  opts: FollowUpOpts,
  nextFollowUpAt?: number | null,
): Promise<void> {
  const publish = opts.publish ?? ((e: LeadDeskEvent) => bus.publish(e));
  const base = { at: Date.now(), teamId: lead.teamId, ownerId: lead.ownerId, by };
  try {
    for (const row of rows) {
      await publish({
        ...base,
        type: 'activity.created',
        leadId: lead.id,
        activity: toActivityDTO(row),
      });
    }
    if (nextFollowUpAt !== undefined) {
      await publish({
        ...base,
        type: 'lead.updated',
        leadId: lead.id,
        changes: { nextFollowUpAt },
      });
    }
  } catch (err) {
    console.warn('[followup] event publish failed:', (err as Error).message);
  }
}

async function authorizeLead(user: CurrentUser, leadId: string): Promise<LeadRow> {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new NotFoundError('lead');
  await authorize(user, 'lead:write', {
    kind: 'lead',
    lead: { id: lead.id, ownerId: lead.ownerId, teamId: lead.teamId, stage: lead.stage },
  });
  return lead;
}

async function loadAuthorized(
  user: CurrentUser,
  followUpId: string,
): Promise<{ followUp: FollowUpRow; lead: LeadRow }> {
  const followUp = db.select().from(followUps).where(eq(followUps.id, followUpId)).get();
  if (!followUp) throw new NotFoundError('follow-up');
  const lead = await authorizeLead(user, followUp.leadId);
  return { followUp, lead };
}

export async function create(
  user: CurrentUser,
  leadId: string,
  input: CreateFollowUp,
  opts: FollowUpOpts = {},
): Promise<FollowUpDTO> {
  const now = opts.now ?? Date.now();
  const lead = await authorizeLead(user, leadId);
  if (!isOpenStage(lead.stage)) {
    throw new ConflictError('Cannot schedule a follow-up on a closed lead');
  }
  assertDueAt(input.dueAt, now);
  const res = withTx((tx) =>
    createInTx(tx, { lead, actorId: user.id, dueAt: input.dueAt, note: input.note, now }),
  );
  await announce(lead, user.id, res.activities, opts, res.followUp.dueAt);
  return toFollowUpDTO(res.followUp);
}

export async function complete(
  user: CurrentUser,
  followUpId: string,
  opts: FollowUpOpts = {},
): Promise<FollowUpDTO> {
  const now = opts.now ?? Date.now();
  const { followUp, lead } = await loadAuthorized(user, followUpId);
  const res = withTx((tx) => {
    const done = completeInTx(tx, followUp.id, lead.id, null, now, user.id);
    const row = addFollowUpActivity(tx, {
      leadId: lead.id,
      type: 'FOLLOW_UP_SCHEDULED',
      action: 'done_without_activity',
      note: 'Follow-up marked done without activity',
      now,
      metadata: { followUpId: followUp.id },
    });
    return { done, row };
  });
  await announce(lead, user.id, [res.row], opts, null);
  return toFollowUpDTO(res.done);
}

export async function snooze(
  user: CurrentUser,
  followUpId: string,
  dueAt: number,
  opts: FollowUpOpts = {},
): Promise<FollowUpDTO> {
  const now = opts.now ?? Date.now();
  const { followUp, lead } = await loadAuthorized(user, followUpId);
  assertDueAt(dueAt, now);
  const res = withTx((tx) => {
    const cur = tx.select().from(followUps).where(eq(followUps.id, followUp.id)).get()!;
    if (cur.status !== 'PENDING') throw new ConflictError('Follow-up is no longer pending');
    tx.update(followUps).set({ dueAt }).where(eq(followUps.id, cur.id)).run();
    const row = addFollowUpActivity(tx, {
      leadId: lead.id,
      type: 'FOLLOW_UP_SCHEDULED',
      action: 'snoozed',
      note: `Follow-up snoozed to ${formatDue(dueAt)}`,
      now,
      metadata: { followUpId: cur.id, dueAt, rescheduledFrom: cur.dueAt },
    });
    writeAudit(tx, {
      actorId: user.id,
      action: 'follow_up.snooze',
      entity: 'follow_up',
      entityId: cur.id,
      before: { dueAt: cur.dueAt },
      after: { dueAt },
    });
    return { followUp: { ...cur, dueAt }, row };
  });
  await announce(lead, user.id, [res.row], opts, dueAt);
  return toFollowUpDTO(res.followUp);
}

export async function cancel(
  user: CurrentUser,
  followUpId: string,
  note: string | undefined,
  opts: FollowUpOpts = {},
): Promise<FollowUpDTO> {
  const now = opts.now ?? Date.now();
  const { followUp, lead } = await loadAuthorized(user, followUpId);
  const res = withTx((tx) => {
    const cur = tx.select().from(followUps).where(eq(followUps.id, followUp.id)).get()!;
    if (cur.status !== 'PENDING') throw new ConflictError('Follow-up is no longer pending');
    tx.update(followUps)
      .set({ status: 'CANCELLED', note: note ?? cur.note })
      .where(eq(followUps.id, cur.id))
      .run();
    const row = addFollowUpActivity(tx, {
      leadId: lead.id,
      type: 'FOLLOW_UP_SCHEDULED',
      action: 'cancelled',
      note: note ? `Follow-up cancelled: ${note}` : 'Follow-up cancelled',
      now,
      metadata: { followUpId: cur.id },
    });
    writeAudit(tx, {
      actorId: user.id,
      action: 'follow_up.cancel',
      entity: 'follow_up',
      entityId: cur.id,
      before: { status: cur.status },
      after: { status: 'CANCELLED' },
    });
    return { followUp: { ...cur, status: 'CANCELLED' as const, note: note ?? cur.note }, row };
  });
  await announce(lead, user.id, [res.row], opts, null);
  return toFollowUpDTO(res.followUp);
}

export async function patch(
  user: CurrentUser,
  followUpId: string,
  input: PatchFollowUp,
  opts: FollowUpOpts = {},
): Promise<FollowUpDTO> {
  switch (input.action) {
    case 'complete':
      return complete(user, followUpId, opts);
    case 'snooze':
      return snooze(user, followUpId, input.dueAt, opts);
    case 'cancel':
      return cancel(user, followUpId, input.note, opts);
  }
}

/* --------------------------------------------------------------------- list */

export type FollowUpListItem = {
  id: string;
  leadId: string;
  dueAt: number;
  note: string | null;
  overdue: boolean;
  assignedTo: string;
  lead: {
    id: string;
    name: string;
    priority: Priority;
    stage: Stage;
    preferredChannel: Channel;
  };
};

export type FollowUpList = {
  items: FollowUpListItem[];
  counts: { dueToday: number; overdue: number };
};

export async function listForUser(
  user: CurrentUser,
  query: { view: FollowUpView; owner?: string; tz?: string },
  opts: { now?: number } = {},
): Promise<FollowUpList> {
  const now = opts.now ?? Date.now();
  const tz = query.tz ?? 'UTC';
  let target = user.id;
  if (query.owner && query.owner !== user.id) {
    const scope = await getScope(user.id);
    if (scope.role === 'REP' || !scope.userIds.has(query.owner)) {
      throw new ForbiddenError('You cannot view follow-ups for that user');
    }
    target = query.owner;
  }
  const eod = endOfDay(now, tz);
  const mine = and(
    eq(followUps.assignedTo, target),
    eq(followUps.status, 'PENDING'),
    inArray(leads.stage, [...OPEN_STAGES]),
  );

  const where =
    query.view === 'overdue'
      ? and(mine, lt(followUps.dueAt, now))
      : query.view === 'today'
        ? and(mine, lt(followUps.dueAt, eod))
        : and(mine, sql`${followUps.dueAt} >= ${eod}`);

  const rows = db
    .select({
      f: followUps,
      priority: leads.priority,
      stage: leads.stage,
      first: customers.firstName,
      last: customers.lastName,
      channel: customers.preferredChannel,
    })
    .from(followUps)
    .innerJoin(leads, eq(leads.id, followUps.leadId))
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(where)
    .orderBy(asc(followUps.dueAt))
    .limit(200)
    .all();

  const c = db
    .select({
      dueToday: sql<number>`count(*)`,
      overdue: sql<number>`coalesce(sum(case when ${followUps.dueAt} < ${now} then 1 else 0 end), 0)`,
    })
    .from(followUps)
    .innerJoin(leads, eq(leads.id, followUps.leadId))
    .where(and(mine, lt(followUps.dueAt, eod)))
    .get();

  return {
    items: rows.map((r) => ({
      id: r.f.id,
      leadId: r.f.leadId,
      dueAt: r.f.dueAt,
      note: r.f.note,
      overdue: r.f.dueAt < now,
      assignedTo: r.f.assignedTo,
      lead: {
        id: r.f.leadId,
        name: `${r.first} ${r.last}`,
        priority: r.priority,
        stage: r.stage,
        preferredChannel: r.channel,
      },
    })),
    counts: { dueToday: c?.dueToday ?? 0, overdue: c?.overdue ?? 0 },
  };
}

export const followupService = {
  create,
  patch,
  complete,
  snooze,
  cancel,
  listForUser,
  createInTx,
  completeInTx,
  cancelAllForLead,
  reassignPending,
};
