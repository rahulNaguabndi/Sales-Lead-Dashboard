import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { OPEN_STAGES, type AssignStrategy } from '@leaddesk/shared';
import type { Tx } from '../db/client';
import { getRedis, redisStatus } from '../redis/client';
import { leads, teams, users } from '../db/schema';
import type { Conn } from './dedupe';

export type Candidate = {
  id: string;
  name: string;
  languages: string[];
  openCount: number;
  lastAssignedAt: number | null;
};

export type Assignment = {
  ownerId: string | null;
  strategy: AssignStrategy | 'STICKY' | null;
  reason: string | null;
  openCount: number | null;
  unassignedReason: 'auto_assign_off' | 'all_at_capacity' | 'no_active_reps' | null;
};

export type TeamResolution = {
  teamId: string;
  routing: 'sticky' | 'country' | 'fallback_round_robin';
};

const byNameThenId = (a: Candidate, b: Candidate) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** Fewest open leads; ties → oldest last_assigned_at (never assigned first) → name → id. */
export function selectLoadBalanced(cands: Candidate[]): Candidate {
  return [...cands].sort(
    (a, b) =>
      a.openCount - b.openCount ||
      (a.lastAssignedAt ?? -1) - (b.lastAssignedAt ?? -1) ||
      byNameThenId(a, b),
  )[0]!;
}

export function selectLanguageMatch(
  cands: Candidate[],
  language: string,
): { candidate: Candidate; reason: string } {
  const speakers = cands.filter((c) => c.languages.includes(language));
  if (speakers.length > 0) {
    return { candidate: selectLoadBalanced(speakers), reason: `language match: ${language}` };
  }
  return {
    candidate: selectLoadBalanced(cands),
    reason: `language fallback: no ${language} speaker`,
  };
}

/** First rep after the cursor (ordered by name then id), wrapping around. */
export function selectRoundRobin(cands: Candidate[], cursor: string | null): Candidate {
  const ordered = [...cands].sort(byNameThenId);
  const idx = cursor ? ordered.findIndex((c) => c.id === cursor) : -1;
  return ordered[(idx + 1) % ordered.length]!;
}

type RepRow = {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  teamId: string | null;
  maxOpenLeads: number;
  openCount: number;
};

/** Active REPs of the team who are below their open-lead capacity. */
export function eligibleReps<T extends RepRow>(rows: T[], teamId: string): T[] {
  return rows.filter(
    (r) => r.role === 'REP' && r.isActive && r.teamId === teamId && r.openCount < r.maxOpenLeads,
  );
}

function openCounts(conn: Conn): Map<string, number> {
  const rows = conn
    .select({ ownerId: leads.ownerId, n: sql<number>`count(*)` })
    .from(leads)
    .where(inArray(leads.stage, [...OPEN_STAGES]))
    .groupBy(leads.ownerId)
    .all();
  return new Map(rows.filter((r) => r.ownerId).map((r) => [r.ownerId!, Number(r.n)]));
}

function teamReps(conn: Conn, teamId: string) {
  const counts = openCounts(conn);
  return conn
    .select()
    .from(users)
    .where(eq(users.teamId, teamId))
    .all()
    .map((u) => ({ ...u, openCount: counts.get(u.id) ?? 0 }));
}

const NINETY_DAYS_MS = 90 * 24 * 3_600_000;

/**
 * Sticky owner: the customer's most recent lead that is open (or active within 90 days) whose
 * owner is an active REP below capacity.
 */
export function findStickyOwner(
  conn: Conn,
  customerId: string,
  now: number,
): { userId: string; teamId: string } | null {
  const rows = conn
    .select()
    .from(leads)
    .where(eq(leads.customerId, customerId))
    .orderBy(sql`${leads.createdAt} desc`)
    .all();
  const counts = openCounts(conn);
  for (const l of rows) {
    if (!l.ownerId) continue;
    const isOpen = (OPEN_STAGES as readonly string[]).includes(l.stage);
    const recent = now - (l.lastActivityAt ?? l.createdAt) <= NINETY_DAYS_MS;
    if (!isOpen && !recent) continue;
    const owner = conn.select().from(users).where(eq(users.id, l.ownerId)).get();
    if (!owner || owner.role !== 'REP' || !owner.isActive || !owner.teamId) continue;
    if ((counts.get(owner.id) ?? 0) >= owner.maxOpenLeads) continue;
    return { userId: owner.id, teamId: owner.teamId };
  }
  return null;
}

let memRr = 0;

async function nextTeamCounter(): Promise<number> {
  if (redisStatus() === 'connected') {
    try {
      return (await getRedis().incr('rr:teams')) - 1;
    } catch {
      /* fall through to the in-memory counter */
    }
  }
  return memRr++;
}

/** Sticky owner's team → country team → round-robin across teams. */
export async function resolveTeam(
  conn: Conn,
  country: string,
  sticky: { userId: string; teamId: string } | null,
): Promise<TeamResolution> {
  if (sticky) return { teamId: sticky.teamId, routing: 'sticky' };
  const all = conn.select().from(teams).orderBy(asc(teams.name)).all();
  const match = all.find((t) => t.countries.includes(country));
  if (match) return { teamId: match.id, routing: 'country' };
  const n = await nextTeamCounter();
  return { teamId: all[n % all.length]!.id, routing: 'fallback_round_robin' };
}

/** Chooses an owner for a new lead in the team, or null (pool) with the reason. Updates counters. */
export function pickAssignee(
  tx: Tx,
  teamId: string,
  opts: { language: string; stickyOwnerId?: string | null; now: number },
): Assignment {
  const team = tx.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) throw new Error(`routing: team ${teamId} not found`);
  const reps = teamReps(tx, teamId);
  const stamp = (id: string) =>
    tx.update(users).set({ lastAssignedAt: opts.now }).where(eq(users.id, id)).run();

  if (opts.stickyOwnerId) {
    const owner = reps.find((r) => r.id === opts.stickyOwnerId);
    if (owner) {
      stamp(owner.id);
      return {
        ownerId: owner.id,
        strategy: 'STICKY',
        reason: 'existing customer relationship',
        openCount: owner.openCount,
        unassignedReason: null,
      };
    }
  }
  const none = (unassignedReason: NonNullable<Assignment['unassignedReason']>): Assignment => ({
    ownerId: null,
    strategy: null,
    reason: null,
    openCount: null,
    unassignedReason,
  });
  if (!team.autoAssign) return none('auto_assign_off');
  if (!reps.some((r) => r.role === 'REP' && r.isActive)) return none('no_active_reps');
  const pool = eligibleReps(reps, teamId);
  if (pool.length === 0) return none('all_at_capacity');

  const cands: Candidate[] = pool.map((r) => ({
    id: r.id,
    name: r.name,
    languages: r.languages,
    openCount: r.openCount,
    lastAssignedAt: r.lastAssignedAt,
  }));
  let pick: Candidate;
  let reason: string;
  if (team.assignStrategy === 'LANGUAGE_MATCH') {
    const r = selectLanguageMatch(cands, opts.language);
    pick = r.candidate;
    reason = `${r.reason} · ${pick.openCount} open leads`;
  } else if (team.assignStrategy === 'ROUND_ROBIN') {
    pick = selectRoundRobin(cands, team.rrCursor);
    reason = 'round robin';
    tx.update(teams).set({ rrCursor: pick.id }).where(eq(teams.id, teamId)).run();
  } else {
    pick = selectLoadBalanced(cands);
    reason = `least loaded · ${pick.openCount} open leads`;
  }
  stamp(pick.id);
  return {
    ownerId: pick.id,
    strategy: team.assignStrategy,
    reason,
    openCount: pick.openCount,
    unassignedReason: null,
  };
}

// ── Per-team serialization ────────────────────────────────────────────────────────────────────
const mutexes = new Map<string, Promise<unknown>>();
const RELEASE =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** Runs fn exclusively per team: in-process mutex always, plus a Redis lock across instances. */
export async function withTeamLock<T>(teamId: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = mutexes.get(teamId) ?? Promise.resolve();
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const key = `lock:assign:${teamId}`;
      const token = randomUUID();
      let held = false;
      if (redisStatus() === 'connected') {
        try {
          for (let i = 0; i < 3 && !held; i++) {
            held = (await getRedis().set(key, token, 'PX', 5000, 'NX')) === 'OK';
            if (!held) await new Promise((r) => setTimeout(r, 50));
          }
        } catch {
          /* degraded: the in-process mutex still serializes this instance */
        }
        if (!held) {
          console.warn(JSON.stringify({ level: 'warn', msg: 'assign_lock_not_obtained', teamId }));
        }
      }
      try {
        return await fn();
      } finally {
        if (held)
          await getRedis()
            .eval(RELEASE, 1, key, token)
            .catch(() => undefined);
      }
    });
  mutexes.set(teamId, run);
  try {
    return await run;
  } finally {
    if (mutexes.get(teamId) === run) mutexes.delete(teamId);
  }
}
