import { z } from 'zod';
import { SOURCE_GROUPS } from './source-groups';

export const DASHBOARD_RANGES = ['today', '7d', '30d', '90d', 'mtd', 'custom'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_TZ = 'Europe/Brussels';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const optId = z.string().min(1).max(64).optional();

/** Query filters shared by every /api/dashboard endpoint and the UI's URL state. */
export const DashboardFilterSchema = z
  .object({
    range: z.enum(DASHBOARD_RANGES).default('30d'),
    from: isoDate.optional(),
    to: isoDate.optional(),
    teamId: optId,
    ownerId: optId,
    sourceGroup: z.enum(SOURCE_GROUPS).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.range === 'custom') {
      if (!v.from) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from is required' });
      if (!v.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to is required' });
    }
  });

export type DashboardFilters = z.infer<typeof DashboardFilterSchema>;

export type DashboardPeriod = {
  from: number;
  to: number;
  prevFrom: number;
  prevTo: number;
  tz: typeof DASHBOARD_TZ;
  /** ISO dates (Brussels) of the first and last day, for drill-down links. */
  fromDate: string;
  toDate: string;
};

export type DashboardScopeInfo = {
  level: 'OWN' | 'TEAM' | 'ORG';
  teamIds: string[];
  ownerIds: string[];
};

export type DashboardEnvelope = {
  scope: DashboardScopeInfo;
  period: DashboardPeriod;
  generatedAt: number;
};

export type SeriesPoint = { d: string; v: number | null };

export type Kpi = {
  value: number | null;
  prev: number | null;
  series?: SeriesPoint[];
  lowerIsBetter?: boolean;
};

export type SummaryResponse = DashboardEnvelope & {
  kpis: {
    newLeads: Kpi;
    coveragePct: Kpi;
    avgFrtMinutes: Kpi;
    conversionPct: Kpi;
    revenueCents: Kpi;
    overdueFollowUps: Kpi;
  };
  strip: {
    slaBreaches: number;
    pipelineValueCents: number;
    goingCold: { atRisk: number; cold: number };
  };
  /** REP view only. */
  personal?: {
    openLeads: number;
    dueToday: number;
    wonInPeriod: number;
    touchesPerDay: { d: string; v: number }[];
  };
};

export type LeadsOverTimeResponse = DashboardEnvelope & {
  bucket: 'day' | 'week';
  groups: readonly string[];
  rows: ({ d: string; total: number } & Record<string, number | string>)[];
};

export type FunnelResponse = DashboardEnvelope & {
  stages: { stage: string; reached: number; current: number }[];
};

export type SourcesResponse = DashboardEnvelope & {
  rows: { source: string; leads: number; won: number; lost: number; winRatePct: number | null }[];
  orgWinRatePct: number | null;
};

export type LostReasonsResponse = DashboardEnvelope & {
  rows: { reason: string; count: number; pct: number }[];
};

export type StageAgingResponse = DashboardEnvelope & {
  rows: { stage: string; avgDays: number | null; targetDays: number; n: number }[];
};

export type PerformanceRow = {
  open: number;
  newInPeriod: number;
  contacted: number;
  coveragePct: number | null;
  avgFrtMinutes: number | null;
  slaBreaches: number;
  overdue: number;
  won: number;
  revenueCents: number;
};

export type LeaderboardRow = PerformanceRow & { userId: string; name: string };
export type TeamRow = PerformanceRow & { teamId: string; name: string };

export type LeaderboardResponse = DashboardEnvelope & { rows: LeaderboardRow[] };
export type TeamComparisonResponse = DashboardEnvelope & { rows: TeamRow[] };
