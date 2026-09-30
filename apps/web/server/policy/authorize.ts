import { and, eq, inArray, sql } from 'drizzle-orm';
import { OPEN_STAGES } from '@leaddesk/shared';
import { db, type Db } from '../db/client';
import { leads, users } from '../db/schema';
import { AppError, ForbiddenError, NotFoundError } from '../http/errors';
import { MUTATION_ACTIONS, isLeadAction, type Action } from './actions';
import { isLeadVisible } from './lead-filter';
import { getScope } from './scope';
import type { AuthzResult, CurrentUser, LeadResource, Resource, Scope } from './types';

/** Claim by a rep who is already at their open-lead limit. */
export class ClaimLimitReachedError extends AppError {
  readonly statusCode = 403;
  readonly code = 'CLAIM_LIMIT_REACHED';
}

/** Test/DI hooks: a pre-resolved scope and/or database. Production callers omit this. */
export type AuthzDeps = { scope?: Scope; database?: Db };

const CLOSED_STAGES = new Set(['WON', 'LOST']);

function deny(message?: string): never {
  throw new ForbiddenError(message);
}

function logDenied(user: CurrentUser, action: Action, resource: Resource | undefined): void {
  const resourceId =
    resource?.kind === 'lead'
      ? resource.lead.id
      : resource?.kind === 'team'
        ? resource.team.id
        : null;
  // No PII: ids only.
  process.stdout.write(
    `${JSON.stringify({ level: 'warn', message: 'authorization denied', userId: user.id, action, resourceId })}\n`,
  );
}

async function countOpenLeads(database: Db, userId: string): Promise<number> {
  const row = database
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.ownerId, userId), inArray(leads.stage, [...OPEN_STAGES])))
    .get();
  return row?.n ?? 0;
}

async function leadRule(
  user: CurrentUser,
  scope: Scope,
  action: Action,
  res: LeadResource,
  database: Db,
): Promise<AuthzResult> {
  const { lead } = res;
  if (!isLeadVisible(scope, lead)) throw new NotFoundError('lead');
  const isRep = scope.role === 'REP';

  switch (action) {
    case 'lead:read':
      return { allowed: true };

    case 'lead:write': {
      if (CLOSED_STAGES.has(lead.stage) && res.activityType !== 'NOTE') {
        deny('Closed leads only accept notes');
      }
      if (isRep && lead.ownerId !== user.id) deny('Only the lead owner can do this');
      return { allowed: true };
    }

    case 'lead:claim': {
      if (lead.ownerId !== null) deny('Lead is already assigned');
      if (!isRep) return { allowed: true };
      if (lead.teamId !== user.teamId) deny('Lead belongs to another team');
      const open = res.openLeadCount ?? (await countOpenLeads(database, user.id));
      const me = database
        .select({ max: users.maxOpenLeads })
        .from(users)
        .where(eq(users.id, user.id))
        .get();
      const limit = me?.max ?? 25;
      if (open >= limit) {
        throw new ClaimLimitReachedError(
          `You have reached your limit of ${limit} open leads. Close or hand over a lead before claiming another.`,
        );
      }
      return { allowed: true };
    }

    case 'lead:assign': {
      if (isRep) deny('Only managers can assign leads');
      const target = res.targetUser;
      if (target === null) return { allowed: true }; // unassign: back to the pool (FR-010)
      if (!target) deny('An assignee is required');
      if (!target.isActive) deny('Cannot assign to an inactive user');
      if (!scope.userIds.has(target.id)) deny('Assignee is outside your organisation scope');
      if (scope.role === 'MANAGER' && target.role !== 'REP' && target.id !== user.id) {
        deny('Managers can only assign to reps or themselves');
      }
      const newTeamId = target.teamId && target.teamId !== lead.teamId ? target.teamId : undefined;
      return newTeamId ? { allowed: true, newTeamId } : { allowed: true };
    }

    case 'lead:changeStage':
      if (isRep && lead.ownerId !== user.id) deny('Only the lead owner can do this');
      return { allowed: true };

    case 'lead:reopen':
      if (isRep) deny('Only managers can reopen leads');
      return { allowed: true };

    default:
      return deny();
  }
}

function teamInScope(scope: Scope, res: Resource | undefined): boolean {
  return res?.kind !== 'team' || scope.isOrgWide || scope.teamIds.has(res.team.id);
}

function otherRule(
  user: CurrentUser,
  scope: Scope,
  action: Action,
  res: Resource | undefined,
): AuthzResult {
  const role = scope.role;
  const ok: AuthzResult = { allowed: true };
  switch (action) {
    case 'dashboard:personal':
    case 'offer:read':
      return ok;
    case 'offer:manage':
    case 'dashboard:org':
      return role === 'VP' ? ok : deny();
    case 'audit:read':
    case 'user:list':
      return role === 'REP' ? deny() : ok;
    case 'dashboard:team':
    case 'demographics:read':
      if (role === 'REP') deny();
      return teamInScope(scope, res) ? ok : deny();
    case 'team:read':
      if (role === 'REP') {
        return res?.kind !== 'team' || res.team.id === user.teamId ? ok : deny();
      }
      return teamInScope(scope, res) ? ok : deny();
    case 'team:settings':
      if (role === 'VP') return ok;
      if (role === 'MANAGER' && res?.kind === 'team' && res.team.managerId === user.id) return ok;
      return deny();
    default:
      return deny();
  }
}

/**
 * The single permission check (FR-006). Throws NotFoundError for out-of-scope leads and
 * ForbiddenError (or ClaimLimitReachedError) otherwise. The role comes from the DB-resolved scope
 * (FR-014), never from client claims.
 */
export async function authorize(
  user: CurrentUser,
  action: Action,
  resource?: Resource,
  deps: AuthzDeps = {},
): Promise<AuthzResult> {
  const scope = deps.scope ?? (await getScope(user.id));
  const database = deps.database ?? db;
  try {
    if (isLeadAction(action)) {
      if (resource?.kind !== 'lead') return deny();
      return await leadRule(user, scope, action, resource, database);
    }
    return otherRule(user, scope, action, resource);
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof ClaimLimitReachedError) {
      if (MUTATION_ACTIONS.has(action)) logDenied(user, action, resource);
    }
    throw err;
  }
}

/** Boolean form of authorize for UI hints. Unexpected errors still propagate. */
export async function can(
  user: CurrentUser,
  action: Action,
  resource?: Resource,
  deps?: AuthzDeps,
): Promise<boolean> {
  try {
    await authorize(user, action, resource, deps);
    return true;
  } catch (err) {
    if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 404)) return false;
    throw err;
  }
}
