import { and, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { leads } from '../db/schema';
import type { Scope } from './types';

/** SQL form of the FR-004 visibility rule, for list and aggregate queries. TRUE when org-wide. */
export function leadScopeWhere(scope: Scope): SQL {
  if (scope.isOrgWide) return sql`1 = 1`;
  const owned = inArray(leads.ownerId, [...scope.userIds]);
  if (scope.teamIds.size === 0) return owned;
  const pool = and(isNull(leads.ownerId), inArray(leads.teamId, [...scope.teamIds]));
  return or(owned, pool) as SQL;
}

/** The same FR-004 rule in TypeScript, used for single-object checks. */
export function isLeadVisible(
  scope: Scope,
  lead: { ownerId: string | null; teamId: string },
): boolean {
  if (scope.isOrgWide) return true;
  if (lead.ownerId !== null) return scope.userIds.has(lead.ownerId);
  return scope.teamIds.has(lead.teamId);
}
