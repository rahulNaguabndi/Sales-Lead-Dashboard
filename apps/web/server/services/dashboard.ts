import { sql, type SQL } from 'drizzle-orm';
import {
  OPEN_STAGES,
  SOURCE_GROUPS,
  SOURCE_GROUP_OF,
  SLA_TARGETS_MS,
  LEAD_SOURCES,
  type DashboardFilters,
  type DashboardEnvelope,
  type DashboardPeriod,
  type DashboardScopeInfo,
  type FunnelResponse,
  type Kpi,
  type LeaderboardResponse,
  type LeadsOverTimeResponse,
  type LostReasonsResponse,
  type PerformanceRow,
  type SeriesPoint,
  type SourcesResponse,
  type StageAgingResponse,
  type SummaryResponse,
  type TeamComparisonResponse,
  type LeadSource,
} from '@leaddesk/shared';
import { db as defaultDb, type Db } from '../db/client';
import { can, leadScopeWhere, type CurrentUser, type Scope } from '../policy';
import {
  InvalidFilterError,
  OutOfScopeError,
  STAGE_AGING_TARGETS,
  addDays,
  bucketFor,
  bucketKey,
  dayKey,
  resolvePeriod,
  safeDiv,
  zeroFillBuckets,
  zonedDayStart,
} from './dashboard-metrics';

export type DashboardCtx = { user: CurrentUser; scope: Scope };
export type DashboardDeps = { db?: Db; now?: number };

const AT_RISK_AFTER_MS = 2 * 86_400_000;
const COLD_AFTER_MS = 3 * 86_400_000;
const OPEN_LIST = OPEN_STAGES.map((s) => `'${s}'`).join(',');
const FUNNEL_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'TEST_DRIVE',
  'NEGOTIATION',
  'WON',
] as const;

const HAS_CONTACT = sql.raw(
  `EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = leads.id AND a.kind = 'USER' AND a.type <> 'NOTE')`,
);
const NEXT_FU = sql.raw(
  `(SELECT MIN(f.due_at) FROM follow_ups f WHERE f.lead_id = leads.id AND f.status = 'PENDING')`,
);
const slaBreachSql = (now: number) =>
  sql`(leads.stage = 'NEW' AND NOT ${HAS_CONTACT} AND ${now} > leads.created_at + CASE leads.priority WHEN 'HOT' THEN ${SLA_TARGETS_MS.HOT} ELSE ${SLA_TARGETS_MS.OTHER} END)`;
const overdueSql = (now: number) =>
  sql`(leads.stage IN (${sql.raw(OPEN_LIST)}) AND COALESCE(${NEXT_FU} < ${now}, 0))`;

const list = (vals: readonly (string | number)[]): SQL =>
  sql.join(
    vals.map((v) => sql`${v}`),
    sql`, `,
  );

/** Filters resolved against the viewer's scope. */
export type ResolvedFilters = {
  period: DashboardPeriod;
  scopeInfo: DashboardScopeInfo;
  /** SQL predicate over `leads`: scope + team + owner + source group. */
  where: SQL;
  teamId: string | null;
  ownerId: string | null;
  /** true when the viewer only sees their own leads. */
  personal: boolean;
  isOrg: boolean;
  teamIds: string[] | null;
};

/** Intersects the requested team/rep with the viewer's scope. Out of scope → 403, rep/team mismatch → 400. */
export async function resolveFilters(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<ResolvedFilters> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const { user, scope } = ctx;
  const period = resolvePeriod(filters, now);
  const authz = { scope, database };
  const [leader, isOrg] = await Promise.all([
    can(user, 'dashboard:team', undefined, authz),
    can(user, 'dashboard:org', undefined, authz),
  ]);
  const personal = !leader;

  let teamId = filters.teamId ?? null;
  let ownerId = filters.ownerId ?? null;

  if (personal) {
    if (ownerId && ownerId !== user.id) throw new OutOfScopeError();
    if (teamId && teamId !== user.teamId) throw new OutOfScopeError();
    ownerId = user.id;
    teamId = null;
  } else {
    if (teamId && !scope.isOrgWide && !scope.teamIds.has(teamId)) throw new OutOfScopeError();
    if (ownerId && !scope.isOrgWide && !scope.userIds.has(ownerId)) throw new OutOfScopeError();
    if (teamId && scope.isOrgWide) {
      const t = database.all<{ id: string }>(sql`SELECT id FROM teams WHERE id = ${teamId}`);
      if (t.length === 0) throw new InvalidFilterError('Unknown team');
    }
    if (ownerId) {
      const u = database.all<{ team_id: string | null }>(
        sql`SELECT team_id FROM users WHERE id = ${ownerId}`,
      )[0];
      if (!u) throw new InvalidFilterError('Unknown rep');
      if (teamId && u.team_id !== teamId) throw new InvalidFilterError('Rep not in selected team');
    }
  }

  const teamIds = teamId ? [teamId] : scope.isOrgWide ? null : [...scope.teamIds];
  const parts: SQL[] = [leadScopeWhere(scope)];
  if (teamId) parts.push(sql`leads.team_id = ${teamId}`);
  if (ownerId) parts.push(sql`leads.owner_id = ${ownerId}`);
  if (filters.sourceGroup) {
    const sources = LEAD_SOURCES.filter((s) => SOURCE_GROUP_OF[s] === filters.sourceGroup);
    parts.push(sql`leads.source IN (${list(sources)})`);
  }

  const scopeInfo: DashboardScopeInfo = {
    level: personal ? 'OWN' : scope.isOrgWide ? 'ORG' : 'TEAM',
    teamIds: teamId ? [teamId] : [...scope.teamIds],
    ownerIds: ownerId ? [ownerId] : [...scope.userIds],
  };
  return {
    period,
    scopeInfo,
    where: sql.join(parts, sql` AND `),
    teamId,
    ownerId,
    personal,
    isOrg,
    teamIds,
  };
}

const envelope = (rf: ResolvedFilters, now: number): DashboardEnvelope => ({
  scope: rf.scopeInfo,
  period: rf.period,
  generatedAt: now,
});

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

type CreatedRow = { created_at: number; contact: number; frt: number | null };
type ClosedRow = { closed_at: number; stage: string; deal_value: number | null };

function createdRows(database: Db, rf: ResolvedFilters, from: number, to: number): CreatedRow[] {
  return database.all<CreatedRow>(sql`
    SELECT leads.created_at AS created_at,
           CASE WHEN ${HAS_CONTACT} THEN 1 ELSE 0 END AS contact,
           CASE WHEN leads.first_response_at IS NOT NULL THEN leads.first_response_at - leads.created_at END AS frt
    FROM leads
    WHERE ${rf.where} AND leads.created_at BETWEEN ${from} AND ${to}
  `);
}

function closedRows(database: Db, rf: ResolvedFilters, from: number, to: number): ClosedRow[] {
  return database.all<ClosedRow>(sql`
    SELECT leads.closed_at AS closed_at, leads.stage AS stage, leads.deal_value AS deal_value
    FROM leads
    WHERE ${rf.where} AND leads.stage IN ('WON','LOST') AND leads.closed_at BETWEEN ${from} AND ${to}
  `);
}

function coverage(rows: CreatedRow[]): number | null {
  const v = safeDiv(rows.reduce((s, r) => s + r.contact, 0) * 100, rows.length);
  return round1(v);
}
function avgFrt(rows: CreatedRow[]): number | null {
  const withFrt = rows.filter((r) => r.frt !== null);
  const v = safeDiv(
    withFrt.reduce((s, r) => s + r.frt!, 0),
    withFrt.length,
  );
  return v === null ? null : Math.round(v / 60_000);
}
function conversion(rows: ClosedRow[]): number | null {
  return round1(safeDiv(rows.filter((r) => r.stage === 'WON').length * 100, rows.length));
}
function revenue(rows: ClosedRow[]): number {
  return rows.reduce((s, r) => s + (r.stage === 'WON' ? (r.deal_value ?? 0) : 0), 0);
}

/** Per-bucket series over the period; `fn` receives the rows of one bucket. */
function series<T>(
  period: DashboardPeriod,
  rows: T[],
  at: (r: T) => number,
  fn: (rows: T[]) => number | null,
): SeriesPoint[] {
  const bucket = bucketFor(period.from, period.to);
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = bucketKey(at(r), bucket);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return zeroFillBuckets(period.from, period.to, new Map()).keys.map((d) => ({
    d,
    v: fn(groups.get(d) ?? []),
  }));
}

export async function getSummary(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<SummaryResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;

  const created = createdRows(database, rf, p.prevFrom, p.to);
  const cur = created.filter((r) => r.created_at >= p.from);
  const prev = created.filter((r) => r.created_at < p.from);
  const closed = closedRows(database, rf, p.prevFrom, p.to);
  const closedCur = closed.filter((r) => r.closed_at >= p.from);
  const closedPrev = closed.filter((r) => r.closed_at < p.from);

  const overdue =
    database.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM leads WHERE ${rf.where} AND ${overdueSql(now)}`,
    )[0]?.n ?? 0;

  const kpis: SummaryResponse['kpis'] = {
    newLeads: {
      value: cur.length,
      prev: prev.length,
      series: series(
        p,
        cur,
        (r) => r.created_at,
        (g) => g.length,
      ),
    },
    coveragePct: {
      value: coverage(cur),
      prev: coverage(prev),
      series: series(
        p,
        cur,
        (r) => r.created_at,
        (g) => coverage(g),
      ),
    },
    avgFrtMinutes: {
      value: avgFrt(cur),
      prev: avgFrt(prev),
      lowerIsBetter: true,
      series: series(
        p,
        cur,
        (r) => r.created_at,
        (g) => avgFrt(g),
      ),
    },
    conversionPct: {
      value: conversion(closedCur),
      prev: conversion(closedPrev),
      series: series(
        p,
        closedCur,
        (r) => r.closed_at,
        (g) => conversion(g),
      ),
    },
    revenueCents: {
      value: revenue(closedCur),
      prev: revenue(closedPrev),
      series: series(
        p,
        closedCur,
        (r) => r.closed_at,
        (g) => revenue(g),
      ),
    },
    overdueFollowUps: { value: overdue, prev: null, lowerIsBetter: true },
  };

  const stripRow = database.all<{
    sla: number | null;
    pipeline: number | null;
    at_risk: number | null;
    cold: number | null;
  }>(sql`
    SELECT
      SUM(CASE WHEN ${slaBreachSql(now)} THEN 1 ELSE 0 END) AS sla,
      SUM(CASE WHEN leads.stage IN (${sql.raw(OPEN_LIST)}) THEN COALESCE(leads.deal_value, leads.budget_max, 0) ELSE 0 END) AS pipeline,
      SUM(CASE WHEN leads.stage IN (${sql.raw(OPEN_LIST)})
                AND COALESCE(leads.last_contact_at, leads.created_at) <= ${now - AT_RISK_AFTER_MS}
                AND COALESCE(leads.last_contact_at, leads.created_at) > ${now - COLD_AFTER_MS} THEN 1 ELSE 0 END) AS at_risk,
      SUM(CASE WHEN leads.stage = 'COLD' THEN 1 ELSE 0 END) AS cold
    FROM leads WHERE ${rf.where}
  `)[0];

  const out: SummaryResponse = {
    ...envelope(rf, now),
    kpis,
    strip: {
      slaBreaches: stripRow?.sla ?? 0,
      pipelineValueCents: stripRow?.pipeline ?? 0,
      goingCold: { atRisk: stripRow?.at_risk ?? 0, cold: stripRow?.cold ?? 0 },
    },
  };

  if (rf.personal) {
    const endOfToday = zonedDayStart(addDays(dayKey(now), 1));
    const openLeads =
      database.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM leads WHERE ${rf.where} AND leads.stage IN (${sql.raw(OPEN_LIST)})`,
      )[0]?.n ?? 0;
    const dueToday =
      database.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM leads WHERE ${rf.where} AND leads.stage IN (${sql.raw(OPEN_LIST)}) AND ${NEXT_FU} < ${endOfToday}`,
      )[0]?.n ?? 0;
    const touches = database.all<{ created_at: number }>(sql`
      SELECT a.created_at AS created_at FROM activities a
      WHERE a.actor_id = ${ctx.user.id} AND a.kind = 'USER' AND a.type <> 'NOTE'
        AND a.created_at BETWEEN ${p.from} AND ${p.to}
    `);
    const tSeries = series(
      p,
      touches,
      (r) => r.created_at,
      (g) => g.length,
    );
    out.personal = {
      openLeads,
      dueToday,
      wonInPeriod: closedCur.filter((r) => r.stage === 'WON').length,
      touchesPerDay: tSeries.map((s) => ({ d: s.d, v: s.v ?? 0 })),
    };
  }
  return out;
}

export async function getLeadsOverTime(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<LeadsOverTimeResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  await requireLeader(ctx, deps);
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;
  const rows = database.all<{ created_at: number; source: LeadSource }>(
    sql`SELECT created_at, source FROM leads WHERE ${rf.where} AND created_at BETWEEN ${p.from} AND ${p.to}`,
  );
  const bucket = bucketFor(p.from, p.to);
  const counts = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const k = bucketKey(r.created_at, bucket);
    const c = counts.get(k) ?? {};
    const g = SOURCE_GROUP_OF[r.source];
    c[g] = (c[g] ?? 0) + 1;
    counts.set(k, c);
  }
  const { keys } = zeroFillBuckets(p.from, p.to, new Map());
  return {
    ...envelope(rf, now),
    bucket,
    groups: SOURCE_GROUPS,
    rows: keys.map((d) => {
      const c = counts.get(d) ?? {};
      const row: Record<string, number | string> = { d };
      let total = 0;
      for (const g of SOURCE_GROUPS) {
        row[g] = c[g] ?? 0;
        total += c[g] ?? 0;
      }
      return { ...row, d, total };
    }),
  };
}

export async function getFunnel(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<FunnelResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;
  const inPeriod = sql`${rf.where} AND leads.created_at BETWEEN ${p.from} AND ${p.to}`;
  const stages = FUNNEL_STAGES.map((stage) => {
    const reached =
      stage === 'NEW'
        ? database.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM leads WHERE ${inPeriod}`)[0]?.n
        : database.all<{ n: number }>(sql`
            SELECT COUNT(*) AS n FROM leads
            WHERE ${inPeriod} AND (leads.stage = ${stage}
              OR EXISTS (SELECT 1 FROM stage_history sh WHERE sh.lead_id = leads.id AND sh.to_stage = ${stage}))
          `)[0]?.n;
    const current =
      database.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM leads WHERE ${inPeriod} AND leads.stage = ${stage}`,
      )[0]?.n ?? 0;
    return { stage, reached: reached ?? 0, current };
  });
  return { ...envelope(rf, now), stages };
}

type ClosedBySource = { source: LeadSource; n: number; won: number; lost: number };

export async function getSources(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<SourcesResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  await requireLeader(ctx, deps);
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;
  const volume = database.all<{ source: LeadSource; n: number }>(sql`
    SELECT source, COUNT(*) AS n FROM leads
    WHERE ${rf.where} AND created_at BETWEEN ${p.from} AND ${p.to} GROUP BY source
  `);
  const closed = database.all<ClosedBySource>(sql`
    SELECT source, COUNT(*) AS n,
           SUM(CASE WHEN stage = 'WON' THEN 1 ELSE 0 END) AS won,
           SUM(CASE WHEN stage = 'LOST' THEN 1 ELSE 0 END) AS lost
    FROM leads
    WHERE ${rf.where} AND stage IN ('WON','LOST') AND closed_at BETWEEN ${p.from} AND ${p.to}
    GROUP BY source
  `);
  const bySource = new Map<string, { leads: number; won: number; lost: number }>();
  for (const v of volume) bySource.set(v.source, { leads: v.n, won: 0, lost: 0 });
  for (const c of closed) {
    const e = bySource.get(c.source) ?? { leads: 0, won: 0, lost: 0 };
    e.won = c.won;
    e.lost = c.lost;
    bySource.set(c.source, e);
  }
  const rows = [...bySource.entries()]
    .map(([source, e]) => ({
      source,
      ...e,
      winRatePct: round1(safeDiv(e.won * 100, e.won + e.lost)),
    }))
    .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
  const won = rows.reduce((s, r) => s + r.won, 0);
  const lost = rows.reduce((s, r) => s + r.lost, 0);
  return { ...envelope(rf, now), rows, orgWinRatePct: round1(safeDiv(won * 100, won + lost)) };
}

export async function getLostReasons(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<LostReasonsResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  await requireLeader(ctx, deps);
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;
  const found = database.all<{ reason: string | null; n: number }>(sql`
    SELECT lost_reason AS reason, COUNT(*) AS n FROM leads
    WHERE ${rf.where} AND stage = 'LOST' AND closed_at BETWEEN ${p.from} AND ${p.to}
    GROUP BY lost_reason
  `);
  const total = found.reduce((s, r) => s + r.n, 0);
  const rows = found
    .map((r) => ({
      reason: r.reason ?? 'UNSPECIFIED',
      count: r.n,
      pct: round1(safeDiv(r.n * 100, total)) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { ...envelope(rf, now), rows };
}

export async function getStageAging(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<StageAgingResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  await requireLeader(ctx, deps);
  const rf = await resolveFilters(ctx, filters, deps);
  const p = rf.period;
  const found = database.all<{ stage: string; avg_ms: number; n: number }>(sql`
    SELECT to_stage AS stage, AVG(dur) AS avg_ms, COUNT(*) AS n FROM (
      SELECT sh.to_stage AS to_stage, sh.changed_at AS changed_at,
             COALESCE(LEAD(sh.changed_at) OVER (PARTITION BY sh.lead_id ORDER BY sh.changed_at), ${now}) - sh.changed_at AS dur
      FROM stage_history sh
      WHERE sh.lead_id IN (SELECT id FROM leads WHERE ${rf.where})
    )
    WHERE changed_at BETWEEN ${p.from} AND ${p.to} AND to_stage IN (${sql.raw(OPEN_LIST)})
    GROUP BY to_stage
  `);
  const by = new Map(found.map((r) => [r.stage, r]));
  const rows = OPEN_STAGES.map((stage) => {
    const r = by.get(stage);
    return {
      stage,
      avgDays: r ? Math.round((r.avg_ms / 86_400_000) * 10) / 10 : null,
      targetDays: STAGE_AGING_TARGETS[stage]!,
      n: r?.n ?? 0,
    };
  });
  return { ...envelope(rf, now), rows };
}

type Acc = {
  open: number;
  sla: number;
  overdue: number;
  created: number;
  contact: number;
  frtN: number;
  frtSum: number;
  won: number;
  revenue: number;
};
const blank = (): Acc => ({
  open: 0,
  sla: 0,
  overdue: 0,
  created: 0,
  contact: 0,
  frtN: 0,
  frtSum: 0,
  won: 0,
  revenue: 0,
});

/** Aggregates the leaderboard metrics grouped by current owner or by team. */
function performance(
  database: Db,
  rf: ResolvedFilters,
  groupCol: 'owner_id' | 'team_id',
  now: number,
): Map<string, PerformanceRow> {
  const g = sql.raw(`leads.${groupCol}`);
  const p = rf.period;
  const acc = new Map<string, Acc>();
  const get = (k: string | null) => {
    const key = k ?? '';
    return acc.get(key) ?? acc.set(key, blank()).get(key)!;
  };

  for (const r of database.all<{
    g: string | null;
    open: number;
    sla: number;
    overdue: number;
  }>(sql`
    SELECT ${g} AS g, COUNT(*) AS open,
           SUM(CASE WHEN ${slaBreachSql(now)} THEN 1 ELSE 0 END) AS sla,
           SUM(CASE WHEN ${overdueSql(now)} THEN 1 ELSE 0 END) AS overdue
    FROM leads WHERE ${rf.where} AND leads.stage IN (${sql.raw(OPEN_LIST)}) GROUP BY ${g}
  `)) {
    Object.assign(get(r.g), { open: r.open, sla: r.sla, overdue: r.overdue });
  }
  for (const r of database.all<{
    g: string | null;
    n: number;
    contact: number;
    frt_n: number;
    frt_sum: number | null;
  }>(sql`
    SELECT ${g} AS g, COUNT(*) AS n,
           SUM(CASE WHEN ${HAS_CONTACT} THEN 1 ELSE 0 END) AS contact,
           SUM(CASE WHEN leads.first_response_at IS NOT NULL THEN 1 ELSE 0 END) AS frt_n,
           SUM(leads.first_response_at - leads.created_at) AS frt_sum
    FROM leads WHERE ${rf.where} AND leads.created_at BETWEEN ${p.from} AND ${p.to} GROUP BY ${g}
  `)) {
    Object.assign(get(r.g), {
      created: r.n,
      contact: r.contact,
      frtN: r.frt_n,
      frtSum: r.frt_sum ?? 0,
    });
  }
  for (const r of database.all<{ g: string | null; won: number; revenue: number | null }>(sql`
    SELECT ${g} AS g, COUNT(*) AS won, SUM(COALESCE(leads.deal_value, 0)) AS revenue
    FROM leads WHERE ${rf.where} AND leads.stage = 'WON' AND leads.closed_at BETWEEN ${p.from} AND ${p.to} GROUP BY ${g}
  `)) {
    Object.assign(get(r.g), { won: r.won, revenue: r.revenue ?? 0 });
  }

  const out = new Map<string, PerformanceRow>();
  for (const [k, a] of acc) {
    out.set(k, {
      open: a.open,
      newInPeriod: a.created,
      contacted: a.contact,
      coveragePct: round1(safeDiv(a.contact * 100, a.created)),
      avgFrtMinutes: a.frtN ? Math.round(a.frtSum / a.frtN / 60_000) : null,
      slaBreaches: a.sla,
      overdue: a.overdue,
      won: a.won,
      revenueCents: a.revenue,
    });
  }
  return out;
}

const EMPTY_ROW: PerformanceRow = {
  open: 0,
  newInPeriod: 0,
  contacted: 0,
  coveragePct: null,
  avgFrtMinutes: null,
  slaBreaches: 0,
  overdue: 0,
  won: 0,
  revenueCents: 0,
};

export async function getLeaderboard(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<LeaderboardResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  await requireLeader(ctx, deps);
  const rf = await resolveFilters(ctx, filters, deps);
  if (!rf.teamIds || rf.teamIds.length === 0) throw new InvalidFilterError('teamId is required');
  const perf = performance(database, rf, 'owner_id', now);
  const users = database.all<{ id: string; name: string; role: string }>(sql`
    SELECT id, name, role FROM users
    WHERE team_id IN (${list(rf.teamIds)}) ${rf.ownerId ? sql`AND id = ${rf.ownerId}` : sql``}
    ORDER BY name
  `);
  const rows = users
    .filter((u) => u.role === 'REP' || perf.has(u.id))
    .map((u) => ({ userId: u.id, name: u.name, ...(perf.get(u.id) ?? EMPTY_ROW) }));
  return { ...envelope(rf, now), rows };
}

export async function getTeamComparison(
  ctx: DashboardCtx,
  filters: DashboardFilters,
  deps: DashboardDeps = {},
): Promise<TeamComparisonResponse> {
  const database = deps.db ?? defaultDb;
  const now = deps.now ?? Date.now();
  const rf = await resolveFilters(ctx, filters, deps);
  if (!rf.isOrg) throw new OutOfScopeError();
  const perf = performance(database, rf, 'team_id', now);
  const teams = database.all<{ id: string; name: string }>(
    sql`SELECT id, name FROM teams ORDER BY name`,
  );
  const rows = teams
    .filter((t) => !rf.teamId || t.id === rf.teamId)
    .map((t) => ({ teamId: t.id, name: t.name, ...(perf.get(t.id) ?? EMPTY_ROW) }));
  return { ...envelope(rf, now), rows };
}

/** MANAGER/VP-only endpoints: a REP gets 403. */
export async function requireLeader(ctx: DashboardCtx, deps: DashboardDeps = {}): Promise<void> {
  const ok = await can(ctx.user, 'dashboard:team', undefined, {
    scope: ctx.scope,
    database: deps.db ?? defaultDb,
  });
  if (!ok) throw new OutOfScopeError();
}
