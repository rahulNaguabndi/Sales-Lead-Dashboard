import * as React from 'react';
import { eq, sql } from 'drizzle-orm';
import type { Role } from '@leaddesk/shared';
import { db, type Db } from '../db/client';
import { users } from '../db/schema';
import { NotFoundError } from '../http/errors';
import type { Scope } from './types';

const MAX_DEPTH = 10;

type Memoize = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;
// React.cache exists in the Next.js server runtime; fall back to no memoization elsewhere (tests).
const memoize: Memoize = (React as unknown as { cache?: Memoize }).cache ?? ((fn) => fn);

type ScopeRow = { id: string; team_id: string | null; depth: number };

/** Uncached scope resolution: the user plus all descendants via a cycle-safe recursive CTE. */
export async function resolveScope(userId: string, database: Db = db): Promise<Scope> {
  const root = database
    .select({ role: users.role, teamId: users.teamId, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!root) throw new NotFoundError('user');

  const rows = database.all<ScopeRow>(sql`
    WITH RECURSIVE sub(id, depth) AS (
      SELECT id, 0 FROM users WHERE id = ${userId}
      UNION
      SELECT u.id, sub.depth + 1 FROM users u JOIN sub ON u.manager_id = sub.id WHERE sub.depth < ${MAX_DEPTH}
    )
    SELECT u.id AS id, u.team_id AS team_id, sub.depth AS depth FROM users u JOIN sub ON sub.id = u.id
  `);

  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  let maxDepth = 0;
  for (const row of rows) {
    userIds.add(row.id);
    if (row.team_id) teamIds.add(row.team_id);
    if (row.depth > maxDepth) maxDepth = row.depth;
  }
  if (root.teamId) teamIds.add(root.teamId);
  if (maxDepth >= MAX_DEPTH) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'scope recursion reached depth limit (manager_id cycle or hierarchy too deep)',
        userId,
        maxDepth: MAX_DEPTH,
      }),
    );
  }

  return {
    userId,
    role: root.role as Role,
    userIds,
    teamIds,
    isOrgWide: root.managerId === null,
  };
}

/** Per-request memoized scope (React cache). */
export const getScope: (userId: string) => Promise<Scope> = memoize((userId: string) =>
  resolveScope(userId),
);

/** Key under which F20 may cache a scope in Redis; invalidate when manager_id/team_id change. */
export function scopeCacheKey(userId: string): string {
  return `scope:${userId}`;
}
