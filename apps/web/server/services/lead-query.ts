import { sql, type SQL } from 'drizzle-orm';
import {
  LeadListQuerySchema,
  SLA_TARGETS_MS,
  type Channel,
  type LeadListQuery,
  type LeadSource,
  type Outcome,
  type Priority,
  type Stage,
  type ActivityType,
} from '@leaddesk/shared';
import { db as defaultDb, type Db } from '../db/client';
import { leadScopeWhere, resolveScope, type CurrentUser, type Scope } from '../policy';
import {
  endOfDay,
  normalizeListParams,
  searchTerms,
  zonedDayStart,
  type NormalizedParams,
} from './lead-query.rank';

const DAY = 24 * 60 * 60 * 1000;
const COLD_AFTER_MS = 3 * DAY;
const AT_RISK_AFTER_MS = 2 * DAY;

export type LeadListItem = {
  id: string;
  reference: string;
  customer: {
    id: string;
    name: string;
    city: string | null;
    country: string;
    isReturning: boolean;
    preferredChannel: Channel;
  };
  vehicleModel: string | null;
  source: LeadSource;
  stage: Stage;
  priority: Priority;
  score: number;
  owner: { id: string; name: string; avatarColor: string } | null;
  createdAt: number;
  lastActivityAt: number | null;
  lastActivity: { type: ActivityType; outcome: Outcome | null; at: number } | null;
  nextFollowUpAt: number | null;
  flags: { overdue: boolean; slaBreach: boolean; atRisk: boolean };
};

export type TabCounts = {
  mine: number;
  unassigned: number;
  dueToday: number;
  overdue: number;
  newUntouched: number;
  goingCold: number;
};

export type LeadListResult = {
  items: LeadListItem[];
  page: number;
  pageSize: number;
  total: number;
  counts: TabCounts;
  view: NormalizedParams['view'];
  sort: LeadListQuery['sort'];
};

export type QueryDeps = { db?: Db; now?: number };

// Correlated subqueries; each hits an index (follow_ups_assignee_status_due_idx is per assignee,
// the lead_id scan is small per lead) and keeps the main query a single pass.
const NEXT_FU = sql.raw(
  `(SELECT MIN(f.due_at) FROM follow_ups f WHERE f.lead_id = leads.id AND f.status = 'PENDING')`,
);
const HAS_CONTACT = sql.raw(
  `EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = leads.id AND a.kind = 'USER' AND a.type <> 'NOTE')`,
);

const slaBreachSql = (now: number) =>
  sql`(leads.stage = 'NEW' AND NOT ${HAS_CONTACT} AND ${now} > leads.created_at + CASE leads.priority WHEN 'HOT' THEN ${SLA_TARGETS_MS.HOT} ELSE ${SLA_TARGETS_MS.OTHER} END)`;
// COALESCE: no pending follow-up must rank as 0, not NULL, or NULLs split the ORDER BY groups.
const overdueSql = (now: number) => sql`COALESCE(${NEXT_FU} < ${now}, 0)`;
const untouchedSql = sql`(leads.stage = 'NEW' AND NOT ${HAS_CONTACT})`;
const coldSql = (now: number) =>
  sql`(leads.stage IN ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION') AND COALESCE(leads.last_contact_at, leads.created_at) <= ${now - COLD_AFTER_MS})`;

const and = (parts: SQL[]): SQL => sql.join(parts, sql` AND `);
const list = (vals: readonly (string | number)[]): SQL =>
  sql.join(
    vals.map((v) => sql`${v}`),
    sql`, `,
  );

/** FR-001: scope via F03. The working set of a REP for derived views is their own leads. */
function worksetWhere(user: CurrentUser, scope: Scope): SQL {
  return user.role === 'REP' ? sql`leads.owner_id = ${user.id}` : leadScopeWhere(scope);
}

function buildWhere(user: CurrentUser, scope: Scope, p: NormalizedParams, now: number): SQL {
  const where: SQL[] = [leadScopeWhere(scope)];

  switch (p.view) {
    case 'mine':
      where.push(sql`leads.owner_id = ${user.id}`);
      break;
    case 'unassigned':
      where.push(sql`leads.owner_id IS NULL`);
      break;
    case 'due_today':
      where.push(worksetWhere(user, scope), sql`${NEXT_FU} < ${endOfDay(now, p.tz)}`);
      break;
    case 'going_cold':
      where.push(worksetWhere(user, scope), coldSql(now));
      break;
    case 'team':
      break;
  }

  where.push(sql`leads.stage IN (${list(p.stages)})`);

  if (p.sources)
    where.push(p.sources.length ? sql`leads.source IN (${list(p.sources)})` : sql`0 = 1`);
  if (p.priorities) where.push(sql`leads.priority IN (${list(p.priorities)})`);
  if (p.returning !== undefined) where.push(sql`c.is_returning = ${p.returning ? 1 : 0}`);
  if (p.overdue) where.push(overdueSql(now));
  if (p.slaBreached) where.push(slaBreachSql(now));
  if (p.sort === 'oldest_untouched') where.push(untouchedSql);

  // FR-014: out-of-scope owner/team values are intersected with the scope, never rejected.
  if (p.owners) {
    const ids = p.owners.filter((o) => o !== 'unassigned' && scope.userIds.has(o));
    const parts: SQL[] = [];
    if (ids.length) parts.push(sql`leads.owner_id IN (${list(ids)})`);
    if (p.owners.includes('unassigned')) parts.push(sql`leads.owner_id IS NULL`);
    where.push(parts.length ? sql`(${sql.join(parts, sql` OR `)})` : sql`0 = 1`);
  }
  if (p.teams) {
    const ids = p.teams.filter((t) => scope.isOrgWide || scope.teamIds.has(t));
    where.push(ids.length ? sql`leads.team_id IN (${list(ids)})` : sql`0 = 1`);
  }

  if (p.createdFrom) where.push(sql`leads.created_at >= ${zonedDayStart(p.createdFrom, p.tz)}`);
  if (p.createdTo) {
    const next = new Date(`${p.createdTo}T00:00:00Z`).getTime() + DAY;
    where.push(
      sql`leads.created_at < ${zonedDayStart(new Date(next).toISOString().slice(0, 10), p.tz)}`,
    );
  }

  const terms = searchTerms(p.q);
  if (terms) {
    const ors: SQL[] = [sql`leads.reference LIKE ${terms.reference + '%'} ESCAPE '\\'`];
    if (terms.text) ors.push(sql`c.search_text LIKE ${'%' + terms.text + '%'} ESCAPE '\\'`);
    where.push(sql`(${sql.join(ors, sql` OR `)})`);
  }

  return and(where);
}

function buildOrderBy(p: NormalizedParams, now: number): SQL {
  const tail = sql`leads.created_at DESC, leads.id DESC`;
  if (p.view === 'going_cold' && p.sort === 'rank') {
    return sql`COALESCE(leads.last_contact_at, leads.created_at) ASC, leads.id ASC`;
  }
  switch (p.sort) {
    case 'newest':
      return tail;
    case 'oldest_untouched':
      return sql`leads.created_at ASC, leads.id ASC`;
    case 'next_follow_up':
      return sql`(${NEXT_FU} IS NULL) ASC, ${NEXT_FU} ASC, ${tail}`;
    case 'score':
      return sql`leads.score DESC, ${tail}`;
    case 'last_activity':
      return sql`(leads.last_activity_at IS NOT NULL) ASC, leads.last_activity_at ASC, leads.id ASC`;
    case 'rank':
      return sql`${overdueSql(now)} DESC, ${slaBreachSql(now)} DESC, leads.score DESC, ${tail}`;
  }
}

const FROM = sql`FROM leads JOIN customers c ON c.id = leads.customer_id LEFT JOIN users u ON u.id = leads.owner_id`;

type Row = {
  id: string;
  reference: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  city: string | null;
  country: string;
  is_returning: number;
  preferred_channel: Channel;
  vehicle_model: string | null;
  source: LeadSource;
  stage: Stage;
  priority: Priority;
  score: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_color: string | null;
  created_at: number;
  last_activity_at: number | null;
  last_contact_at: number | null;
  next_follow_up_at: number | null;
  has_contact: number;
};

type ActivityRow = {
  lead_id: string;
  type: ActivityType;
  outcome: Outcome | null;
  created_at: number;
};

/** The user's default-scope aggregates (FR-009), computed in one statement. */
export async function countTabs(
  user: CurrentUser,
  tz: string,
  deps: QueryDeps = {},
): Promise<TabCounts> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const scope = await resolveScope(user.id, database);
  const work = worksetWhere(user, scope);
  const open = sql`leads.stage IN ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')`;
  const eod = endOfDay(now, tz);
  const row = database.get<Record<keyof TabCounts, number | null>>(sql`
    SELECT
      SUM(CASE WHEN leads.owner_id = ${user.id} THEN 1 ELSE 0 END) AS mine,
      SUM(CASE WHEN leads.owner_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
      SUM(CASE WHEN ${work} AND ${NEXT_FU} < ${eod} THEN 1 ELSE 0 END) AS dueToday,
      SUM(CASE WHEN ${work} AND ${NEXT_FU} < ${now} THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN ${work} AND ${untouchedSql} THEN 1 ELSE 0 END) AS newUntouched,
      SUM(CASE WHEN ${work} AND ${coldSql(now)} THEN 1 ELSE 0 END) AS goingCold
    FROM leads
    WHERE ${leadScopeWhere(scope)} AND ${open}
  `);
  return {
    mine: row?.mine ?? 0,
    unassigned: row?.unassigned ?? 0,
    dueToday: row?.dueToday ?? 0,
    overdue: row?.overdue ?? 0,
    newUntouched: row?.newUntouched ?? 0,
    goingCold: row?.goingCold ?? 0,
  };
}

/** FR-001..FR-014: the scope-enforced, ranked, paged lead list shared by the API and the page. */
export async function listLeads(
  user: CurrentUser,
  rawQuery: LeadListQuery | Record<string, unknown>,
  deps: QueryDeps = {},
): Promise<LeadListResult> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const query = LeadListQuerySchema.parse(rawQuery);
  const p = normalizeListParams(query, user.role);
  const scope = await resolveScope(user.id, database);
  const where = buildWhere(user, scope, p, now);

  const total =
    database.get<{ n: number }>(sql`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`)?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / p.pageSize));
  const page = Math.min(p.page, pages);

  const rows = database.all<Row>(sql`
    SELECT leads.id, leads.reference, leads.customer_id, c.first_name, c.last_name, c.city, c.country,
      c.is_returning, c.preferred_channel, leads.vehicle_model, leads.source, leads.stage,
      leads.priority, leads.score, leads.owner_id, u.name AS owner_name, u.avatar_color AS owner_color,
      leads.created_at, leads.last_activity_at, leads.last_contact_at,
      ${NEXT_FU} AS next_follow_up_at, ${HAS_CONTACT} AS has_contact
    ${FROM}
    WHERE ${where}
    ORDER BY ${buildOrderBy(p, now)}
    LIMIT ${p.pageSize} OFFSET ${(page - 1) * p.pageSize}
  `);

  const latest = new Map<string, ActivityRow>();
  if (rows.length) {
    const acts = database.all<ActivityRow>(sql`
      SELECT a.lead_id, a.type, a.outcome, a.created_at FROM activities a
      WHERE a.lead_id IN (${list(rows.map((r) => r.id))}) AND a.kind = 'USER'
        AND a.id = (SELECT b.id FROM activities b WHERE b.lead_id = a.lead_id AND b.kind = 'USER'
                    ORDER BY b.created_at DESC, b.id DESC LIMIT 1)
    `);
    for (const a of acts) latest.set(a.lead_id, a);
  }

  const items = rows.map((r): LeadListItem => {
    const last = latest.get(r.id);
    const target = r.priority === 'HOT' ? SLA_TARGETS_MS.HOT : SLA_TARGETS_MS.OTHER;
    const lastTouch = r.last_contact_at ?? r.created_at;
    const open = !['WON', 'LOST', 'COLD'].includes(r.stage);
    return {
      id: r.id,
      reference: r.reference,
      customer: {
        id: r.customer_id,
        name: `${r.first_name} ${r.last_name}`,
        city: r.city,
        country: r.country,
        isReturning: r.is_returning === 1,
        preferredChannel: r.preferred_channel,
      },
      vehicleModel: r.vehicle_model,
      source: r.source,
      stage: r.stage,
      priority: r.priority,
      score: r.score,
      owner: r.owner_id
        ? { id: r.owner_id, name: r.owner_name ?? '', avatarColor: r.owner_color ?? '#64748b' }
        : null,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
      lastActivity: last ? { type: last.type, outcome: last.outcome, at: last.created_at } : null,
      nextFollowUpAt: r.next_follow_up_at,
      flags: {
        overdue: r.next_follow_up_at !== null && r.next_follow_up_at < now,
        slaBreach: r.stage === 'NEW' && !r.has_contact && now > r.created_at + target,
        atRisk: open && now - lastTouch > AT_RISK_AFTER_MS && now - lastTouch < COLD_AFTER_MS,
      },
    };
  });

  return {
    items,
    page,
    pageSize: p.pageSize,
    total,
    counts: await countTabs(user, p.tz, { db: database, now }),
    view: p.view,
    sort: p.sort,
  };
}

/** Owner options for the filter popover: users inside the caller's scope (MANAGER/VP only). */
export async function listScopeOwners(
  user: CurrentUser,
  deps: QueryDeps = {},
): Promise<{ id: string; name: string }[]> {
  if (user.role === 'REP') return [];
  const database = deps.db ?? defaultDb;
  const scope = await resolveScope(user.id, database);
  const ids = [...scope.userIds];
  if (!ids.length) return [];
  return database.all<{ id: string; name: string }>(
    sql`SELECT id, name FROM users WHERE id IN (${list(ids)}) AND role = 'REP' AND is_active = 1 ORDER BY name`,
  );
}
