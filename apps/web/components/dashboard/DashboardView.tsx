'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  DashboardFilters,
  FunnelResponse,
  LeaderboardResponse,
  LeadsOverTimeResponse,
  LostReasonsResponse,
  SourcesResponse,
  StageAgingResponse,
  SummaryResponse,
  TeamComparisonResponse,
} from '@leaddesk/shared';
import { apiFetch } from '@/lib/api-client';
import { buildInboxHref } from '@/lib/dashboard-href';
import { useLivePollingInterval } from '@/lib/sse/useLiveEvents';
import { LiveStatusDot } from '@/components/live/LiveStatusDot';
import './palette.css';
import { ChartCard } from './ChartCard';
import {
  FunnelChart,
  FunnelTable,
  LeadsOverTimeChart,
  LeadsOverTimeTable,
  LostReasonsChart,
  LostReasonsTable,
  SourcePerformanceChart,
  SourcesTable,
  StageAgingChart,
  StageAgingTable,
  TouchesPerDayChart,
  TouchesTable,
} from './Charts';
import { FilterBar } from './FilterBar';
import { formatDuration, formatEur, formatInt, formatPct } from './formatters';
import { KpiTile, StatStrip } from './KpiTiles';
import { LeaderboardTable } from './LeaderboardTable';
import { useDashboardFilters } from './useDashboardFilters';
import { tabsFor } from './tabs';

export type DashboardLayout = 'rep' | 'manager' | 'vp';
type Props = {
  layout: DashboardLayout;
  teams: { id: string; name: string }[];
  reps: { id: string; name: string }[];
};

function useDash<T>(path: string, query: string, enabled = true) {
  const poll = useLivePollingInterval();
  return useQuery<T>({
    queryKey: ['dashboard', path, query],
    enabled,
    refetchInterval: poll,
    queryFn: async () => {
      const res = await apiFetch(`/api/dashboard/${path}?${query}`);
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return res.json() as Promise<T>;
    },
  });
}

function UpdatedAgo({ at }: { at?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Updated {Math.max(0, Math.round((now - at) / 1000))} s ago
    </span>
  );
}

export function DashboardView({ layout, teams, reps }: Props) {
  const { filters, setFilters, query } = useDashboardFilters();
  const isVp = layout === 'vp';
  const isRep = layout === 'rep';
  const tabs = tabsFor(layout);
  const [tab, setTab] = useState(tabs[0]?.id ?? 'overview');

  const summary = useDash<SummaryResponse>('summary', query);
  const leader = useDash<LeaderboardResponse>(
    'leaderboard',
    query,
    !isRep && (!isVp || !!filters.teamId),
  );
  const teamCmp = useDash<TeamComparisonResponse>('team-comparison', query, isVp);
  const funnel = useDash<FunnelResponse>('charts/funnel', query);
  const aging = useDash<StageAgingResponse>('charts/stage-aging', query, !isRep);
  const sources = useDash<SourcesResponse>('charts/sources', query, !isRep);
  const overTime = useDash<LeadsOverTimeResponse>('charts/leads-over-time', query, !isRep);
  const lost = useDash<LostReasonsResponse>('charts/lost-reasons', query, !isRep);

  const s = summary.data;
  const period = s?.period ?? null;
  const href = (extra: Parameters<typeof buildInboxHref>[2] = {}) =>
    buildInboxHref(filters, period, extra);

  return (
    <div className="space-y-4 p-4" data-testid="dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <UpdatedAgo at={s?.generatedAt} />
          <LiveStatusDot />
        </div>
      </div>

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        teams={isVp ? teams : undefined}
        reps={isRep ? undefined : reps}
      />

      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-2 border-b">
          {tabs.map((t) =>
            t.href ? (
              <a key={t.id} href={t.href} role="tab" aria-selected={false} className="px-3 py-1 text-sm">
                {t.label}
              </a>
            ) : (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`px-3 py-1 text-sm ${tab === t.id ? 'border-b-2 border-primary font-medium' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
            ),
          )}
        </div>
      )}

      {summary.isError ? (
        <div role="alert" className="text-sm">
          Could not load the summary.{' '}
          <button className="underline" onClick={() => void summary.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <SummaryTiles summary={s} isVp={isVp} isRep={isRep} href={href} />
      )}

      {s && !isRep && (
        <StatStrip
          items={[
            {
              label: 'SLA breaches',
              value: String(s.strip.slaBreaches),
              href: href({ sla: 'breached' }),
            },
            { label: 'Pipeline value', value: formatEur(s.strip.pipelineValueCents) },
            {
              label: 'Going cold',
              value: `${s.strip.goingCold.atRisk} at risk · ${s.strip.goingCold.cold} cold`,
            },
          ]}
        />
      )}

      {isRep ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Touches per day"
            query={summary}
            table={(d) => <TouchesTable series={d.personal?.touchesPerDay ?? []} />}
          >
            {(d) => <TouchesPerDayChart series={d.personal?.touchesPerDay ?? []} />}
          </ChartCard>
          <FunnelCard funnel={funnel} filters={filters} />
        </div>
      ) : (
        <div className="space-y-4">
          {isVp && (
            <ChartCard title="Team comparison" query={teamCmp} isEmpty={(d) => d.rows.length === 0}>
              {(d) => (
                <LeaderboardTable
                  title="Team comparison"
                  rows={d.rows}
                  mode="team"
                  filters={filters}
                  period={d.period}
                  highlightId={filters.teamId}
                />
              )}
            </ChartCard>
          )}
          {isVp && !filters.teamId ? (
            <p className="text-sm text-muted-foreground">
              Select a team to see its rep leaderboard.
            </p>
          ) : (
            <ChartCard title="Rep leaderboard" query={leader} isEmpty={(d) => d.rows.length === 0}>
              {(d) => (
                <LeaderboardTable
                  title="Rep leaderboard"
                  rows={d.rows}
                  mode="rep"
                  filters={filters}
                  period={d.period}
                />
              )}
            </ChartCard>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <FunnelCard funnel={funnel} filters={filters} />
            <ChartCard
              title="Stage aging"
              query={aging}
              table={(d) => <StageAgingTable data={d} />}
            >
              {(d) => <StageAgingChart data={d} />}
            </ChartCard>
            <ChartCard
              title="Leads over time"
              query={overTime}
              isEmpty={(d) => d.rows.every((r) => r.total === 0)}
              table={(d) => <LeadsOverTimeTable data={d} />}
            >
              {(d) => <LeadsOverTimeChart data={d} />}
            </ChartCard>
            <ChartCard
              title="Source performance"
              query={sources}
              isEmpty={(d) => d.rows.length === 0}
              table={(d) => <SourcesTable data={d} />}
            >
              {(d) => <SourcePerformanceChart data={d} filters={filters} />}
            </ChartCard>
            <ChartCard
              title="Lost reasons"
              query={lost}
              isEmpty={(d) => d.rows.length === 0}
              table={(d) => <LostReasonsTable data={d} />}
            >
              {(d) => <LostReasonsChart data={d} />}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelCard({
  funnel,
  filters,
}: {
  funnel: ReturnType<typeof useDash<FunnelResponse>>;
  filters: DashboardFilters;
}) {
  return (
    <ChartCard
      title="Funnel"
      query={funnel}
      isEmpty={(d) => d.stages.every((x) => x.reached === 0)}
      table={(d) => <FunnelTable data={d} />}
    >
      {(d) => <FunnelChart data={d} filters={filters} />}
    </ChartCard>
  );
}

function SummaryTiles({
  summary: s,
  isVp,
  isRep,
  href,
}: {
  summary?: SummaryResponse;
  isVp: boolean;
  isRep: boolean;
  href: (e?: Parameters<typeof buildInboxHref>[2]) => string;
}) {
  if (!s) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }
  const k = s.kpis;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpi-row">
      {isRep && s.personal && (
        <>
          <KpiTile
            label="Open leads"
            kpi={{ value: s.personal.openLeads, prev: null }}
            format={formatInt}
          />
          <KpiTile
            label="Due today"
            kpi={{ value: s.personal.dueToday, prev: null }}
            format={formatInt}
          />
        </>
      )}
      {isVp ? (
        <KpiTile hero label="Revenue won" kpi={k.revenueCents} format={formatEur} />
      ) : (
        <KpiTile hero label="New leads" kpi={k.newLeads} format={formatInt} href={href()} />
      )}
      {isVp && <KpiTile label="New leads" kpi={k.newLeads} format={formatInt} href={href()} />}
      <KpiTile
        label="Coverage"
        kpi={k.coveragePct}
        format={formatPct}
        unit="pct-points"
        hint="No leads in this period"
      />
      <KpiTile
        label="Avg first response"
        kpi={k.avgFrtMinutes}
        format={formatDuration}
        hint="No responses in this period"
      />
      <KpiTile
        label="Conversion"
        kpi={k.conversionPct}
        format={formatPct}
        unit="pct-points"
        hint="Nothing closed in this period"
      />
      {!isVp && <KpiTile label="Revenue" kpi={k.revenueCents} format={formatEur} />}
      <KpiTile
        label="Overdue follow-ups"
        kpi={k.overdueFollowUps}
        format={formatInt}
        href={href({ overdue: '1' })}
      />
    </div>
  );
}
