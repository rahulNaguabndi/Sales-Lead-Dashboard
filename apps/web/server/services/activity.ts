import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { monotonicFactory } from 'ulid';
import {
  IDEMPOTENCY_WINDOW_MS,
  OPEN_STAGES,
  autoAdvance,
  canTransition,
  isContactActivity,
  isScoreFrozen,
  scoreLead,
  type ActivityActorDTO,
  type ActivityResponseDTO,
  type ActivityType,
  type CreateActivity,
  type CreateActivityResponse,
  type LeadDeskEvent,
  type LeadSummary,
  type Outcome,
  type Priority,
  type Stage,
  type StageActor,
  type UserActivityType,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, withTx, type Tx } from '../db/client';
import { activities, auditLog, followUps, leads, stageHistory, users } from '../db/schema';
import { bus } from '../events/bus';
import { AppError, NotFoundError } from '../http/errors';
import { authorize } from '../policy/authorize';
import type { CurrentUser } from '../policy/types';
import { loadScoreInput } from './scoring';

const newId = monotonicFactory();

/* ------------------------------------------------------------------ errors */

export class StaleLeadError extends AppError {
  readonly statusCode = 409;
  readonly code = 'STALE_LEAD';
  constructor(
    readonly currentVersion: number,
    readonly updatedBy: string | null,
  ) {
    super(`This lead was updated by ${updatedBy ?? 'someone else'}. Review and retry.`);
  }
}

export class InvalidTransitionError extends AppError {
  readonly statusCode = 422;
  readonly code = 'INVALID_TRANSITION';
}

export class InvalidFollowUpError extends AppError {
  readonly statusCode = 422;
  readonly code = 'INVALID_FOLLOW_UP';
}

/* ------------------------------------------------------------ pure helpers */

const CONTACT_TYPES: readonly UserActivityType[] = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'];
const RESET_OUTCOMES: readonly Outcome[] = [
  'CONNECTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
];

/** Unanswered-attempt counter after logging an activity (FR-003 step 3). */
export function nextAttemptCount(
  prev: number,
  type: UserActivityType,
  outcome: Outcome | null | undefined,
): number {
  if (type === 'NOTE') return prev;
  if (type === 'MEETING' || type === 'TEST_DRIVE') return 0;
  if (!outcome) return prev;
  if (RESET_OUTCOMES.includes(outcome)) return 0;
  if (CONTACT_TYPES.includes(type) && (outcome === 'NO_ANSWER' || outcome === 'VOICEMAIL')) {
    return prev + 1;
  }
  return prev;
}

/** F06 only performs open -> open moves; WON/LOST/COLD targets and closed sources are refused. */
export function isAllowedOpenTransition(from: Stage, to: Stage, actor: StageActor): boolean {
  const open = OPEN_STAGES as readonly Stage[];
  if (!open.includes(to) || from === 'WON' || from === 'LOST') return false;
  return canTransition(from, to, actor);
}

/* ------------------------------------------------------------------ types */

export type StepName =
  | 'insert_activity'
  | 'attempt_count'
  | 'bookkeeping'
  | 'auto_advance'
  | 'stage_change'
  | 'follow_up_create'
  | 'follow_up_complete'
  | 'score'
  | 'version'
  | 'audit';

export type LogActivityOptions = {
  /** Fault-injection hook: called at the start of each step inside the transaction. */
  onStep?: (step: StepName) => void;
  now?: number;
  ip?: string | null;
  publish?: (e: LeadDeskEvent) => Promise<void> | void;
};

type ActivityRow = typeof activities.$inferSelect;
type LeadRow = typeof leads.$inferSelect;
type FollowUpRow = typeof followUps.$inferSelect;

type Saved = {
  activity: ActivityRow;
  system: ActivityRow[];
  lead: LeadRow;
  followUp: FollowUpRow | null;
  actor: ActivityActorDTO | null;
  before: LeadRow | null;
  replay: boolean;
};

const STAGE_LABEL_REASON: Record<string, string> = {
  'auto:first_activity': 'auto: first activity',
  'auto:revive': 'Revived from COLD',
  manual: 'manual',
};

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

function toDTO(row: ActivityRow, actor: ActivityActorDTO | null): ActivityResponseDTO {
  return {
    id: row.id,
    leadId: row.leadId,
    actorId: row.actorId,
    actorName: actor && row.actorId === actor.id ? actor.name : null,
    actor: actor && row.actorId === actor.id ? actor : null,
    kind: row.kind,
    type: row.type,
    outcome: row.outcome,
    note: row.note,
    aiAssisted: row.aiAssisted,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

function toResponse(s: Saved): CreateActivityResponse {
  const l = s.lead;
  return {
    activity: toDTO(s.activity, s.actor),
    systemActivities: s.system.map((r) => toDTO(r, null)),
    lead: {
      id: l.id,
      stage: l.stage,
      score: l.score,
      priority: l.priority,
      scoreBreakdown: { ...l.scoreBreakdown },
      attemptCount: l.attemptCount,
      firstResponseAt: l.firstResponseAt,
      lastActivityAt: l.lastActivityAt,
      lastContactAt: l.lastContactAt,
      version: l.version,
    },
    followUp: s.followUp
      ? {
          id: s.followUp.id,
          dueAt: s.followUp.dueAt,
          status: s.followUp.status,
          assignedTo: s.followUp.assignedTo,
        }
      : null,
  };
}

function actorOf(tx: Tx, userId: string): ActivityActorDTO | null {
  const u = tx
    .select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return u ?? null;
}

const byRequestId = (id: string) =>
  sql`json_extract(${activities.metadata}, '$.clientRequestId') = ${id}`;

/** FR-005: rebuild the original payload from rows written by an earlier save. */
function findReplay(tx: Tx, leadId: string, requestId: string, now: number): Saved | null {
  const existing = tx
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.leadId, leadId),
        eq(activities.kind, 'USER'),
        gte(activities.createdAt, now - IDEMPOTENCY_WINDOW_MS),
        byRequestId(requestId),
      ),
    )
    .get();
  if (!existing) return null;
  const system = tx
    .select()
    .from(activities)
    .where(
      and(eq(activities.leadId, leadId), eq(activities.kind, 'SYSTEM'), byRequestId(requestId)),
    )
    .orderBy(activities.createdAt, activities.id)
    .all();
  const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) throw new NotFoundError('lead');
  const scheduled = system.find((r) => r.type === 'FOLLOW_UP_SCHEDULED');
  const followUpId = scheduled?.metadata?.followUpId;
  const followUp =
    typeof followUpId === 'string'
      ? (tx.select().from(followUps).where(eq(followUps.id, followUpId)).get() ?? null)
      : null;
  return {
    activity: existing,
    system,
    lead,
    followUp,
    actor: existing.actorId ? actorOf(tx, existing.actorId) : null,
    before: null,
    replay: true,
  };
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

/* ---------------------------------------------------------------- service */

/**
 * Logs one user activity on a lead as a single all-or-nothing transaction (FR-003).
 * Events are published after commit and can never fail the save (FR-004).
 */
export async function logActivity(
  user: CurrentUser,
  leadId: string,
  input: CreateActivity,
  opts: LogActivityOptions = {},
): Promise<CreateActivityResponse> {
  const now = opts.now ?? Date.now();
  const step = (name: StepName) => opts.onStep?.(name);

  // Step 1: load + authorize (404 when not readable, 403 when readable but not permitted).
  const probe = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!probe) throw new NotFoundError('lead');
  await authorize(user, 'lead:write', {
    kind: 'lead',
    lead: { id: probe.id, ownerId: probe.ownerId, teamId: probe.teamId, stage: probe.stage },
    activityType: input.type,
  });

  const saved = withTx((tx): Saved => {
    const replay = findReplay(tx, leadId, input.clientRequestId, now);
    if (replay) return replay;

    const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
    if (!lead) throw new NotFoundError('lead');
    const meta = { clientRequestId: input.clientRequestId };

    if (
      input.stageChange &&
      input.expectedVersion !== undefined &&
      input.expectedVersion !== lead.version
    ) {
      throw new StaleLeadError(lead.version, lastEditorName(tx, leadId));
    }

    const system: ActivityRow[] = [];
    const addSystem = (
      type: ActivityType,
      note: string,
      metadata: Record<string, unknown>,
    ): ActivityRow => {
      const row: ActivityRow = {
        id: newId(),
        leadId,
        actorId: null,
        kind: 'SYSTEM',
        type,
        outcome: null,
        note,
        aiAssisted: false,
        metadata: { ...metadata, ...meta },
        createdAt: now,
      };
      tx.insert(activities).values(row).run();
      system.push(row);
      return row;
    };

    // Step 2: the user's activity.
    step('insert_activity');
    const activity: ActivityRow = {
      id: newId(),
      leadId,
      actorId: user.id,
      kind: 'USER',
      type: input.type,
      outcome: input.outcome ?? null,
      note: input.note,
      aiAssisted: input.aiAssisted ?? false,
      metadata: meta,
      createdAt: now,
    };
    tx.insert(activities).values(activity).run();

    // Step 3: unanswered-attempt counter.
    step('attempt_count');
    const attemptCount = nextAttemptCount(lead.attemptCount, input.type, input.outcome);

    // Step 4: first response / last contact / last activity.
    step('bookkeeping');
    const contact = isContactActivity(input.type, 'USER');
    const firstResponseAt = contact ? (lead.firstResponseAt ?? now) : lead.firstResponseAt;
    const lastContactAt = contact ? now : lead.lastContactAt;

    // Step 5: auto-advance.
    step('auto_advance');
    let stage: Stage = lead.stage;
    const advanced = autoAdvance(stage, input.type, 'USER');
    if (advanced) {
      const reason = stage === 'COLD' ? 'auto:revive' : 'auto:first_activity';
      tx.insert(stageHistory)
        .values({
          id: newId(),
          leadId,
          fromStage: stage,
          toStage: advanced,
          changedBy: user.id,
          reason,
          changedAt: now,
        })
        .run();
      addSystem(
        'STAGE_CHANGED',
        reason === 'auto:revive'
          ? STAGE_LABEL_REASON[reason]!
          : `Stage changed ${stage} → ${advanced} · ${STAGE_LABEL_REASON[reason]}`,
        { from: stage, to: advanced, reason },
      );
      stage = advanced;
    }

    // Step 6: explicit stage change (after auto-advance).
    step('stage_change');
    if (input.stageChange && input.stageChange.to !== stage) {
      const to: Stage = input.stageChange.to;
      if (!isAllowedOpenTransition(stage, to, user.role)) {
        throw new InvalidTransitionError(`Cannot move a lead from ${stage} to ${to}`);
      }
      tx.insert(stageHistory)
        .values({
          id: newId(),
          leadId,
          fromStage: stage,
          toStage: to,
          changedBy: user.id,
          reason: 'manual',
          changedAt: now,
        })
        .run();
      addSystem('STAGE_CHANGED', `Stage changed ${stage} → ${to}`, {
        from: stage,
        to,
        reason: 'manual',
      });
      stage = to;
    }

    // Step 7: schedule the next follow-up.
    step('follow_up_create');
    let followUp: FollowUpRow | null = null;
    if (input.nextFollowUp) {
      const dueAt = Date.parse(input.nextFollowUp.dueAt);
      followUp = {
        id: newId(),
        leadId,
        assignedTo: lead.ownerId ?? user.id,
        dueAt,
        status: 'PENDING',
        note: input.nextFollowUp.note ?? null,
        createdBy: user.id,
        createdAt: now,
        completedAt: null,
        completedByActivityId: null,
      };
      tx.insert(followUps).values(followUp).run();
      addSystem('FOLLOW_UP_SCHEDULED', `Follow-up scheduled for ${formatDue(dueAt)}`, {
        followUpId: followUp.id,
        dueAt,
      });
    }

    // Step 8: complete a pending follow-up.
    step('follow_up_complete');
    if (input.completeFollowUpId) {
      const f = tx.select().from(followUps).where(eq(followUps.id, input.completeFollowUpId)).get();
      if (!f || f.leadId !== leadId || (f.status !== 'PENDING' && f.status !== 'MISSED')) {
        throw new InvalidFollowUpError('Follow-up is not pending on this lead');
      }
      tx.update(followUps)
        .set({ status: 'DONE', completedAt: now, completedByActivityId: activity.id })
        .where(eq(followUps.id, f.id))
        .run();
    }

    // Persist the bookkeeping so the score input reads the updated lead.
    tx.update(leads)
      .set({ stage, attemptCount, firstResponseAt, lastContactAt, lastActivityAt: now })
      .where(eq(leads.id, leadId))
      .run();

    // Step 9: recompute score/priority.
    step('score');
    let { score, priority, scoreBreakdown } = lead;
    if (!isScoreFrozen(stage)) {
      const result = scoreLead(loadScoreInput(tx, leadId), now);
      score = result.score;
      priority = result.priority;
      scoreBreakdown = result.breakdown;
      if (priority !== lead.priority) {
        addSystem('SCORE_CHANGED', `Priority ${lead.priority} → ${priority} (score ${score})`, {
          fromPriority: lead.priority,
          toPriority: priority,
          fromScore: lead.score,
          toScore: score,
        });
      }
    }

    // Step 10: version + modified time.
    step('version');
    tx.update(leads)
      .set({ score, priority, scoreBreakdown, version: lead.version + 1, updatedAt: now })
      .where(eq(leads.id, leadId))
      .run();

    // Step 11: audit.
    step('audit');
    const after = tx.select().from(leads).where(eq(leads.id, leadId)).get()!;
    const pick = (l: LeadRow) => ({
      stage: l.stage,
      attemptCount: l.attemptCount,
      firstResponseAt: l.firstResponseAt,
      lastContactAt: l.lastContactAt,
      lastActivityAt: l.lastActivityAt,
      score: l.score,
      priority: l.priority,
      version: l.version,
    });
    writeAudit(tx, {
      actorId: user.id,
      action: 'activity.create',
      entity: 'lead',
      entityId: leadId,
      before: pick(lead),
      after: pick(after),
      ip: opts.ip ?? null,
      meta: { activityId: activity.id },
    });

    return {
      activity,
      system,
      lead: after,
      followUp,
      actor: actorOf(tx, user.id),
      before: lead,
      replay: false,
    };
  });

  if (!saved.replay) await publishAfterCommit(user, saved, opts);
  return toResponse(saved);
}

/** FR-004: announce after commit; failures are logged and never propagate. */
async function publishAfterCommit(
  user: CurrentUser,
  s: Saved,
  opts: LogActivityOptions,
): Promise<void> {
  const publish = opts.publish ?? ((e: LeadDeskEvent) => bus.publish(e));
  const base = { at: Date.now(), teamId: s.lead.teamId, ownerId: s.lead.ownerId, by: user.id };
  try {
    const rows = [s.activity, ...s.system];
    for (const row of rows) {
      await publish({
        ...base,
        type: 'activity.created',
        leadId: s.lead.id,
        activity: toDTO(row, row.id === s.activity.id ? s.actor : null),
      });
    }
    const b = s.before;
    const changes: Partial<LeadSummary> = { lastActivityAt: s.lead.lastActivityAt };
    if (b?.stage !== s.lead.stage) changes.stage = s.lead.stage;
    if (b?.score !== s.lead.score) changes.score = s.lead.score;
    if (b?.priority !== s.lead.priority) changes.priority = s.lead.priority as Priority;
    await publish({ ...base, type: 'lead.updated', leadId: s.lead.id, changes });
  } catch (err) {
    console.warn('[activity] event publish failed:', (err as Error).message);
  }
}
