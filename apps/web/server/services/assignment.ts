import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  MAX_BULK_ASSIGN,
  OPEN_STAGES,
  type AssigneeDTO,
  type LeadDeskEvent,
  type TeamSettingsDTO,
  type TeamSettingsPatch,
} from '@leaddesk/shared';
import { writeAudit } from '../db/audit';
import { db, withTx, type Tx } from '../db/client';
import { activities, followUps, leads, teams, users } from '../db/schema';
import { bus } from '../events/bus';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../http/errors';
import { authorize, can, getScope, type CurrentUser } from '../policy';
import { pickRep, type PickableRep } from './assignment.pick-rep';
import { withTeamLock } from './routing';

export { pickRep, withTeamLock };

/* ------------------------------------------------------------------ errors */

export class AlreadyAssignedError extends AppError {
  readonly statusCode = 409;
  readonly code = 'ALREADY_ASSIGNED';
  constructor(readonly ownerName: string) {
    super(`Claimed by ${ownerName}`);
  }
}
export class ClaimLimitError extends AppError {
  readonly statusCode = 422;
  readonly code = 'CLAIM_LIMIT';
  constructor(limit: number) {
    super(`Claim limit reached (${limit} open leads)`);
  }
}
export class TargetInactiveError extends AppError {
  readonly statusCode = 422;
  readonly code = 'TARGET_INACTIVE';
  constructor() {
    super('That user is no longer active');
  }
}
export class VersionConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'VERSION_CONFLICT';
  constructor() {
    super('This lead was updated by someone else. Review and retry.');
  }
}
export class BulkForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(readonly leadIds: string[]) {
    super('You cannot assign some of these leads');
  }
}

/* ------------------------------------------------------------------- types */

export type Method = 'AUTO' | 'MANUAL' | 'CLAIM';
type LeadRow = typeof leads.$inferSelect;
type UserRow = typeof users.$inferSelect;

export type AssignedLead = {
  id: string;
  ownerId: string | null;
  assignedAt: number | null;
  version: number;
};
export type ChangeResult = { lead: AssignedLead; changed: boolean };

const openStages = [...OPEN_STAGES];

function openCounts(conn: Tx | typeof db): Map<string | null, number> {
  return new Map(
    conn
      .select({ ownerId: leads.ownerId, n: sql<number>`count(*)` })
      .from(leads)
      .where(inArray(leads.stage, openStages))
      .groupBy(leads.ownerId)
      .all()
      .map((r) => [r.ownerId, Number(r.n)]),
  );
}

const toLead = (l: LeadRow): AssignedLead => ({
  id: l.id,
  ownerId: l.ownerId,
  assignedAt: l.assignedAt,
  version: l.version,
});

/* ------------------------------------------------ shared ownership change */

type Change = {
  lead: LeadRow;
  to: UserRow | null;
  byId: string | null;
  byName: string | null;
  method: Method;
  reason?: string | null;
  now: number;
  /** FR-001: only change the lead if it is still in the pool (claims). */
  requirePool?: boolean;
  /** Strategy reason appended to the AUTO note (FR-010), e.g. "language match (it) · 11 open". */
  autoReason?: string | null;
};

/**
 * One transaction step shared by claim, assign, bulk and auto-assign (FR-004): updates the lead,
 * writes the ASSIGNED/CLAIMED activity and audit row, moves PENDING follow-ups and stamps the
 * assignee. Returns the updated lead and the event to publish after commit.
 */
export function applyOwnershipChange(tx: Tx, c: Change): { lead: LeadRow; event: LeadDeskEvent } {
  const { lead, to, now } = c;
  const teamChanged = !!to?.teamId && to.teamId !== lead.teamId;
  const newTeamId = teamChanged ? to!.teamId! : lead.teamId;
  const res = tx
    .update(leads)
    .set({
      ownerId: to?.id ?? null,
      teamId: newTeamId,
      assignedAt: now,
      version: sql`${leads.version} + 1`,
      updatedAt: now,
    })
    .where(and(eq(leads.id, lead.id), c.requirePool ? isNull(leads.ownerId) : undefined))
    .run();
  if (res.changes === 0) {
    const owner = lead.ownerId
      ? tx.select({ name: users.name }).from(users).where(eq(users.id, lead.ownerId)).get()
      : undefined;
    throw new AlreadyAssignedError(owner?.name ?? 'someone else');
  }

  const teamName = (id: string) =>
    tx.select({ name: teams.name }).from(teams).where(eq(teams.id, id)).get()?.name ?? id;
  let note: string;
  if (c.method === 'CLAIM') note = `Claimed by ${to?.name}`;
  else if (c.method === 'AUTO')
    note = `Auto-assigned to ${to?.name}${c.autoReason ? ` · ${c.autoReason}` : ''}`;
  else if (!to) note = `Returned to pool by ${c.byName ?? 'a manager'}`;
  else note = `Assigned to ${to.name} by ${c.byName ?? 'a manager'}`;
  if (teamChanged) {
    note += `. Moved from ${teamName(lead.teamId)} to ${teamName(newTeamId)}`;
  }

  tx.insert(activities)
    .values({
      id: ulid(),
      leadId: lead.id,
      actorId: c.byId,
      kind: 'SYSTEM',
      type: c.method === 'CLAIM' ? 'CLAIMED' : 'ASSIGNED',
      note,
      aiAssisted: false,
      metadata: {
        from: lead.ownerId,
        to: to?.id ?? null,
        method: c.method,
        ...(c.byName ? { byName: c.byName } : {}),
        ...(to ? { toName: to.name } : {}),
        ...(c.reason ? { reason: c.reason } : {}),
        ...(teamChanged ? { fromTeam: lead.teamId, toTeam: newTeamId } : {}),
      },
      createdAt: now,
    })
    .run();

  if (to) {
    tx.update(followUps)
      .set({ assignedTo: to.id })
      .where(and(eq(followUps.leadId, lead.id), eq(followUps.status, 'PENDING')))
      .run();
    tx.update(users).set({ lastAssignedAt: now }).where(eq(users.id, to.id)).run();
  }

  writeAudit(tx, {
    actorId: c.byId,
    action: 'lead.assign',
    entity: 'lead',
    entityId: lead.id,
    before: { ownerId: lead.ownerId, teamId: lead.teamId },
    after: { ownerId: to?.id ?? null, teamId: newTeamId },
    meta: { method: c.method },
  });

  const updated: LeadRow = {
    ...lead,
    ownerId: to?.id ?? null,
    teamId: newTeamId,
    assignedAt: now,
    version: lead.version + 1,
  };
  const event: LeadDeskEvent = {
    type: 'lead.assigned',
    at: now,
    teamId: newTeamId,
    ownerId: to?.id ?? null,
    by: c.byId,
    leadId: lead.id,
    fromOwnerId: lead.ownerId,
    toOwnerId: to?.id ?? null,
    method: c.method,
  };
  return { lead: updated, event };
}

async function publishAll(events: LeadDeskEvent[]): Promise<void> {
  for (const e of events) await bus.publish(e);
}

/* ------------------------------------------------------------------- claim */

export async function claim(
  user: CurrentUser,
  leadId: string,
  now = Date.now(),
): Promise<ChangeResult> {
  const scope = await getScope(user.id);
  const out = withTx((tx) => {
    const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
    // Team-level visibility only: a lost race must report 409 (who has it), not 404.
    if (!lead || !(scope.isOrgWide || scope.teamIds.has(lead.teamId)))
      throw new NotFoundError('lead');
    if (lead.ownerId !== null) {
      const owner = tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, lead.ownerId))
        .get();
      throw new AlreadyAssignedError(owner?.name ?? 'someone else');
    }
    const me = tx.select().from(users).where(eq(users.id, user.id)).get();
    if (!me) throw new NotFoundError('user');
    if ((openCounts(tx).get(me.id) ?? 0) >= me.maxOpenLeads) {
      throw new ClaimLimitError(me.maxOpenLeads);
    }
    return applyOwnershipChange(tx, {
      lead,
      to: me,
      byId: me.id,
      byName: me.name,
      method: 'CLAIM',
      now,
      requirePool: true,
    });
  });
  await publishAll([out.event]);
  return { lead: toLead(out.lead), changed: true };
}

/* ------------------------------------------------------------------ assign */

async function authorizeAssign(
  user: CurrentUser,
  lead: LeadRow,
  target: UserRow | null,
): Promise<void> {
  await authorize(user, 'lead:assign', {
    kind: 'lead',
    lead: { id: lead.id, ownerId: lead.ownerId, teamId: lead.teamId, stage: lead.stage },
    // Inactivity is a 422 (TARGET_INACTIVE), reported after the scope and role rules pass.
    targetUser: target
      ? { id: target.id, teamId: target.teamId, role: target.role, isActive: true }
      : null,
  });
  if (target && !target.isActive) throw new TargetInactiveError();
}

function loadTarget(toUserId: string | null): UserRow | null {
  if (toUserId === null) return null;
  const t = db.select().from(users).where(eq(users.id, toUserId)).get();
  if (!t) throw new NotFoundError('user');
  return t;
}

export async function assign(
  user: CurrentUser,
  leadId: string,
  input: { toUserId: string | null; reason?: string; version?: number },
  now = Date.now(),
): Promise<ChangeResult> {
  const pre = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!pre) throw new NotFoundError('lead');
  await authorizeAssign(user, pre, loadTarget(input.toUserId));

  const out = withTx((tx) => {
    const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
    if (!lead) throw new NotFoundError('lead');
    if (input.version !== undefined && lead.version !== input.version) {
      throw new VersionConflictError();
    }
    const to = input.toUserId
      ? (tx.select().from(users).where(eq(users.id, input.toUserId)).get() ?? null)
      : null;
    if (to && !to.isActive) throw new TargetInactiveError();
    if ((lead.ownerId ?? null) === (to?.id ?? null)) return null; // no-op
    const by = tx.select({ name: users.name }).from(users).where(eq(users.id, user.id)).get();
    return applyOwnershipChange(tx, {
      lead,
      to,
      byId: user.id,
      byName: by?.name ?? null,
      method: 'MANUAL',
      reason: input.reason,
      now,
    });
  });
  if (!out) return { lead: toLead(pre), changed: false };
  await publishAll([out.event]);
  return { lead: toLead(out.lead), changed: true };
}

export async function bulkAssign(
  user: CurrentUser,
  input: { leadIds: string[]; toUserId: string | null; reason?: string },
  now = Date.now(),
): Promise<{ assigned: number }> {
  const ids = [...new Set(input.leadIds)];
  if (ids.length === 0 || ids.length > MAX_BULK_ASSIGN) {
    throw new ValidationError(`Select between 1 and ${MAX_BULK_ASSIGN} leads`);
  }
  const target = loadTarget(input.toUserId);
  const byId = new Map(
    db
      .select()
      .from(leads)
      .where(inArray(leads.id, ids))
      .all()
      .map((r) => [r.id, r]),
  );
  const offending: string[] = [];
  for (const id of ids) {
    const lead = byId.get(id);
    if (!lead) {
      offending.push(id);
      continue;
    }
    try {
      await authorizeAssign(user, lead, target);
    } catch (err) {
      if (err instanceof ForbiddenError || err instanceof NotFoundError) offending.push(id);
      else throw err;
    }
  }
  if (offending.length > 0) throw new BulkForbiddenError(offending);

  const events = withTx((tx) => {
    const by = tx.select({ name: users.name }).from(users).where(eq(users.id, user.id)).get();
    const evs: LeadDeskEvent[] = [];
    for (const id of ids) {
      const lead = tx.select().from(leads).where(eq(leads.id, id)).get()!;
      if ((lead.ownerId ?? null) === (target?.id ?? null)) continue;
      evs.push(
        applyOwnershipChange(tx, {
          lead,
          to: target,
          byId: user.id,
          byName: by?.name ?? null,
          method: 'MANUAL',
          reason: input.reason,
          now,
        }).event,
      );
    }
    return evs;
  });
  await publishAll(events);
  return { assigned: events.length };
}

/* --------------------------------------------------------------- assignees */

export async function listAssignees(
  user: CurrentUser,
  teamId: string,
  leadId?: string,
): Promise<AssigneeDTO[]> {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new NotFoundError('team');
  // Same rule as configuring the team: its manager, or a VP.
  await authorize(user, 'team:settings', {
    kind: 'team',
    team: { id: team.id, managerId: team.managerId },
  });
  const lang = leadId
    ? db.all<{ language: string }>(
        sql`SELECT c.language AS language FROM leads l JOIN customers c ON c.id = l.customer_id WHERE l.id = ${leadId}`,
      )[0]?.language
    : undefined;
  const counts = openCounts(db);
  return (
    db
      .select()
      .from(users)
      .where(and(eq(users.teamId, teamId), eq(users.isActive, true), eq(users.role, 'REP')))
      .all()
      .map((u) => {
        const open = counts.get(u.id) ?? 0;
        return {
          id: u.id,
          name: u.name,
          openLeads: open,
          languages: u.languages,
          languageMatch: lang ? u.languages.includes(lang) : false,
          maxOpenLeads: u.maxOpenLeads,
          atLimit: open >= u.maxOpenLeads,
        };
      })
      // Reps with room first; over-capacity reps stay pickable but sink to the bottom.
      .sort(
        (a, b) =>
          Number(a.atLimit) - Number(b.atLimit) ||
          Number(b.languageMatch) - Number(a.languageMatch) ||
          a.openLeads - b.openLeads ||
          a.name.localeCompare(b.name),
      )
  );
}

/* ------------------------------------------------------------ auto-assign */

function poolReps(tx: Tx, teamId: string): PickableRep[] {
  const counts = openCounts(tx);
  return tx
    .select()
    .from(users)
    .where(and(eq(users.teamId, teamId), eq(users.role, 'REP')))
    .all()
    .map((u) => ({
      id: u.id,
      name: u.name,
      languages: u.languages,
      openCount: counts.get(u.id) ?? 0,
      lastAssignedAt: u.lastAssignedAt,
      maxOpenLeads: u.maxOpenLeads,
      isActive: u.isActive,
    }));
}

export type AutoAssignResult =
  | { assigned: true; ownerId: string; reason: string }
  | { assigned: false; reason: 'auto_assign_off' | 'all_at_capacity' | 'no_active_reps' };

/** Runs the team's strategy for one pool lead, serialized per team (FR-008). */
export async function autoAssign(
  teamId: string,
  leadId: string,
  language: string,
  now = Date.now(),
): Promise<AutoAssignResult> {
  let event: LeadDeskEvent | null = null;
  const result = await withTeamLock(teamId, () =>
    withTx((tx): AutoAssignResult => {
      const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
      if (!team) throw new NotFoundError('team');
      if (!team.autoAssign) return { assigned: false, reason: 'auto_assign_off' };
      const lead = tx.select().from(leads).where(eq(leads.id, leadId)).get();
      if (!lead || lead.ownerId !== null) throw new NotFoundError('lead');
      const reps = poolReps(tx, teamId);
      if (!reps.some((r) => r.isActive)) return { assigned: false, reason: 'no_active_reps' };
      const pick = pickRep(team.assignStrategy, reps, { language, rrCursor: team.rrCursor });
      if (!pick) return { assigned: false, reason: 'all_at_capacity' };
      if (team.assignStrategy === 'ROUND_ROBIN') {
        tx.update(teams).set({ rrCursor: pick.candidate.id }).where(eq(teams.id, teamId)).run();
      }
      const to = tx.select().from(users).where(eq(users.id, pick.candidate.id)).get()!;
      event = applyOwnershipChange(tx, {
        lead,
        to,
        byId: null,
        byName: null,
        method: 'AUTO',
        autoReason: pick.reason,
        now,
        requirePool: true,
      }).event;
      return { assigned: true, ownerId: to.id, reason: pick.reason };
    }),
  );
  if (event) await bus.publish(event);
  return result;
}

/** Runs the team's strategy over its unassigned leads (max 100, oldest first). */
export async function rebalancePool(
  user: CurrentUser,
  teamId: string,
): Promise<{ assigned: number }> {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new NotFoundError('team');
  await authorize(user, 'team:settings', {
    kind: 'team',
    team: { id: team.id, managerId: team.managerId },
  });
  const pool = db.all<{ id: string; language: string }>(
    sql`SELECT l.id AS id, c.language AS language FROM leads l JOIN customers c ON c.id = l.customer_id
        WHERE l.team_id = ${teamId} AND l.owner_id IS NULL ORDER BY l.created_at LIMIT ${MAX_BULK_ASSIGN}`,
  );
  let assigned = 0;
  for (const l of pool) {
    const r = await autoAssign(teamId, l.id, l.language);
    if (!r.assigned) break; // off, everyone full, or nobody active: no point continuing
    assigned += 1;
  }
  return { assigned };
}

/* ---------------------------------------------------------------- settings */

function settingsFor(teamRows: (typeof teams.$inferSelect)[]): TeamSettingsDTO[] {
  const counts = openCounts(db);
  const pools = new Map(
    db
      .all<{ team_id: string; n: number }>(
        sql`SELECT team_id, COUNT(*) AS n FROM leads
            WHERE owner_id IS NULL AND stage IN ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')
            GROUP BY team_id`,
      )
      .map((r) => [r.team_id, r.n]),
  );
  return teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    autoAssign: t.autoAssign,
    assignStrategy: t.assignStrategy,
    poolSize: pools.get(t.id) ?? 0,
    reps: db
      .select()
      .from(users)
      .where(and(eq(users.teamId, t.id), eq(users.role, 'REP')))
      .orderBy(asc(users.name))
      .all()
      .map((u) => ({
        id: u.id,
        name: u.name,
        isActive: u.isActive,
        maxOpenLeads: u.maxOpenLeads,
        openLeads: counts.get(u.id) ?? 0,
        languages: u.languages,
      })),
  }));
}

export async function getTeamSettings(user: CurrentUser): Promise<TeamSettingsDTO[]> {
  const all = db.select().from(teams).orderBy(asc(teams.name)).all();
  const allowed: typeof all = [];
  for (const t of all) {
    if (
      await can(user, 'team:settings', { kind: 'team', team: { id: t.id, managerId: t.managerId } })
    ) {
      allowed.push(t);
    }
  }
  if (allowed.length === 0) throw new ForbiddenError();
  return settingsFor(allowed);
}

export async function updateTeamSettings(
  user: CurrentUser,
  teamId: string,
  patch: TeamSettingsPatch,
): Promise<TeamSettingsDTO> {
  const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new NotFoundError('team');
  await authorize(user, 'team:settings', {
    kind: 'team',
    team: { id: team.id, managerId: team.managerId },
  });
  withTx((tx) => {
    tx.update(teams)
      .set({ autoAssign: patch.autoAssign, assignStrategy: patch.assignStrategy })
      .where(eq(teams.id, teamId))
      .run();
    for (const r of patch.reps ?? []) {
      const u = tx
        .select()
        .from(users)
        .where(and(eq(users.id, r.id), eq(users.teamId, teamId), eq(users.role, 'REP')))
        .get();
      if (!u) {
        throw new ValidationError(`Unknown rep ${r.id}`);
      }
      const set: Partial<typeof users.$inferInsert> = {};
      if (r.isActive !== undefined) set.isActive = r.isActive;
      if (r.maxOpenLeads !== undefined) set.maxOpenLeads = r.maxOpenLeads;
      if (Object.keys(set).length > 0) tx.update(users).set(set).where(eq(users.id, r.id)).run();
    }
    writeAudit(tx, {
      actorId: user.id,
      action: 'team.settings.update',
      entity: 'team',
      entityId: teamId,
      before: { autoAssign: team.autoAssign, assignStrategy: team.assignStrategy },
      after: {
        autoAssign: patch.autoAssign,
        assignStrategy: patch.assignStrategy,
        reps: patch.reps ?? [],
      },
    });
  });
  return settingsFor([db.select().from(teams).where(eq(teams.id, teamId)).get()!])[0]!;
}
