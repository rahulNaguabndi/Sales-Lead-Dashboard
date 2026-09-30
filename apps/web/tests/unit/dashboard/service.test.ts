import { beforeAll, describe, expect, it } from 'vitest';
import type { DashboardFilters } from '@leaddesk/shared';
import {
  getFunnel,
  getLeaderboard,
  getLeadsOverTime,
  getLostReasons,
  getSources,
  getStageAging,
  getSummary,
  getTeamComparison,
} from '@/server/services/dashboard';
import { buildFixture, NOW, type Fixture } from './fixture';
import { DACH, FUNNEL, LEADERBOARD } from './fixture.expected';

let fx: Fixture;
beforeAll(() => {
  fx = buildFixture();
});

const f = (over: Partial<DashboardFilters> = {}): DashboardFilters => ({ range: '30d', ...over });
const deps = () => ({ db: fx.db, now: NOW });

describe('getSummary — manager (Team DACH)', () => {
  it('matches the hand-computed KPIs, previous period and strip', async () => {
    const s = await getSummary(await fx.ctx('lukas'), f(), deps());
    expect(s.scope.level).toBe('TEAM');
    expect(s.scope.teamIds).toEqual(['dach']);
    expect(s.period.fromDate).toBe('2026-09-01');
    expect(s.generatedAt).toBe(NOW);
    for (const k of ['newLeads', 'coveragePct', 'avgFrtMinutes', 'conversionPct', 'revenueCents', 'overdueFollowUps'] as const) {
      expect({ k, value: s.kpis[k].value, prev: s.kpis[k].prev }).toEqual({ k, ...DACH[k] });
    }
    expect(s.kpis.avgFrtMinutes.lowerIsBetter).toBe(true);
    expect(s.kpis.overdueFollowUps.lowerIsBetter).toBe(true);
    expect(s.strip).toEqual(DACH.strip);
    expect(s.personal).toBeUndefined();
  });

  it('puts the 00:30 Brussels lead on Sep 1 and zero-fills the daily series', async () => {
    const s = await getSummary(await fx.ctx('lukas'), f(), deps());
    const series = s.kpis.newLeads.series!;
    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ d: '2026-09-01', v: 1 });
    expect(series.find((p) => p.d === '2026-09-02')!.v).toBe(0);
    expect(series.reduce((a, p) => a + (p.v ?? 0), 0)).toBe(11);
  });

  it('?range=7d recomputes over the shorter window', async () => {
    const s = await getSummary(await fx.ctx('lukas'), f({ range: '7d' }), deps());
    // Sep 24–30: D7 (felix) and D10 (pool) only
    expect(s.kpis.newLeads.value).toBe(2);
    expect(s.kpis.coveragePct.value).toBe(0);
    expect(s.kpis.avgFrtMinutes.value).toBeNull();
    expect(s.kpis.conversionPct.value).toBe(0); // only D13 (LOST) closed on Sep 24–30: 0 won of 1 closed
  });

  it('gives null (not 0) for ratios with no denominator', async () => {
    const s = await getSummary(await fx.ctx('claire'), f(), deps());
    expect(s.kpis.conversionPct.value).toBeNull();
    expect(s.kpis.avgFrtMinutes.value).toBeNull();
    expect(s.kpis.newLeads).toMatchObject({ value: 1, prev: 0 });
  });

  it('empty period → null ratios and zero counts', async () => {
    const s = await getSummary(
      await fx.ctx('lukas'),
      f({ range: 'custom', from: '2026-01-01', to: '2026-01-31' }),
      deps(),
    );
    expect(s.kpis.newLeads.value).toBe(0);
    expect(s.kpis.coveragePct.value).toBeNull();
    expect(s.kpis.conversionPct.value).toBeNull();
    expect(s.kpis.revenueCents.value).toBe(0);
  });

  it('source-group filter narrows every KPI', async () => {
    const s = await getSummary(await fx.ctx('lukas'), f({ sourceGroup: 'SOCIAL' }), deps());
    expect(s.kpis.newLeads.value).toBe(2); // D2 FACEBOOK, D5 INSTAGRAM
    expect(s.kpis.coveragePct.value).toBe(50);
  });
});

describe('getSummary — VP and REP', () => {
  it('VP sees the org and can scope to one team', async () => {
    const org = await getSummary(await fx.ctx('isabelle'), f(), deps());
    expect(org.scope.level).toBe('ORG');
    expect(org.kpis.newLeads.value).toBe(13); // 11 + W1 + S1
    const south = await getSummary(await fx.ctx('isabelle'), f({ teamId: 'south' }), deps());
    expect(south.kpis.newLeads.value).toBe(1);
    expect(south.kpis.revenueCents.value).toBe(2_000_000);
    expect(south.scope.teamIds).toEqual(['south']);
  });

  it('REP gets only their own numbers plus the personal block', async () => {
    const s = await getSummary(await fx.ctx('felix'), f(), deps());
    expect(s.scope.level).toBe('OWN');
    expect(s.kpis.newLeads.value).toBe(2);
    expect(s.kpis.coveragePct.value).toBe(50);
    expect(s.personal).toMatchObject({ openLeads: 2, dueToday: 2, wonInPeriod: 0 });
    // Felix's single CALL (D8) is on Sep 16
    const touches = s.personal!.touchesPerDay;
    expect(touches).toHaveLength(30);
    expect(touches.reduce((a, p) => a + p.v, 0)).toBe(1);
    expect(touches.find((p) => p.d === '2026-09-16')!.v).toBe(1);
  });
});

describe('getLeaderboard', () => {
  it('matches the hand-computed rows with current-owner attribution', async () => {
    const r = await getLeaderboard(await fx.ctx('lukas'), f(), deps());
    expect(r.rows.map((x) => x.name)).toEqual(['anna', 'felix', 'jonas', 'lea']);
    for (const row of r.rows) {
      const { userId, name, ...rest } = row;
      expect(userId).toBe(name);
      expect(rest, name).toEqual(LEADERBOARD[name as keyof typeof LEADERBOARD]);
    }
  });

  it('a rep with no leads gets nulls/zeros; the VP must pass a team', async () => {
    const r = await getLeaderboard(await fx.ctx('claire'), f(), deps());
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: 'emile', newInPeriod: 1, contacted: 0, coveragePct: 0, avgFrtMinutes: null });
    await expect(getLeaderboard(await fx.ctx('isabelle'), f(), deps())).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
    const vp = await getLeaderboard(await fx.ctx('isabelle'), f({ teamId: 'dach' }), deps());
    expect(vp.rows.map((x) => x.name)).toEqual(['anna', 'felix', 'jonas', 'lea']);
  });

  it('owner filter returns the single rep', async () => {
    const r = await getLeaderboard(await fx.ctx('lukas'), f({ ownerId: 'felix' }), deps());
    expect(r.rows.map((x) => x.name)).toEqual(['felix']);
  });
});

describe('getTeamComparison', () => {
  it('has one row per team and DACH equals the leaderboard sum plus pool leads', async () => {
    const t = await getTeamComparison(await fx.ctx('isabelle'), f(), deps());
    expect(t.rows.map((r) => r.name)).toEqual(['Team DACH', 'Team SOUTH', 'Team WEST']);
    const dach = t.rows.find((r) => r.teamId === 'dach')!;
    const lb = await getLeaderboard(await fx.ctx('lukas'), f(), deps());
    const sum = (k: 'open' | 'newInPeriod' | 'contacted' | 'slaBreaches' | 'overdue' | 'won' | 'revenueCents') =>
      lb.rows.reduce((a, r) => a + r[k], 0);
    // D10 is an unowned pool lead (open, new in period, NEW without contact → SLA breach)
    expect(dach.open).toBe(sum('open') + 1);
    expect(dach.newInPeriod).toBe(sum('newInPeriod') + 1);
    expect(dach.contacted).toBe(sum('contacted'));
    expect(dach.slaBreaches).toBe(sum('slaBreaches') + 1);
    expect(dach.overdue).toBe(sum('overdue'));
    expect(dach.won).toBe(sum('won'));
    expect(dach.revenueCents).toBe(sum('revenueCents'));
    const south = t.rows.find((r) => r.teamId === 'south')!;
    expect(south).toMatchObject({ newInPeriod: 1, coveragePct: 100, avgFrtMinutes: 15, won: 1, revenueCents: 2_000_000 });
  });

  it('the team filter highlights a single row', async () => {
    const t = await getTeamComparison(await fx.ctx('isabelle'), f({ teamId: 'west' }), deps());
    expect(t.rows.map((r) => r.teamId)).toEqual(['west']);
  });
});

describe('getFunnel', () => {
  it('counts reach via stage_history (once per lead, even after backward moves) and current stage', async () => {
    const r = await getFunnel(await fx.ctx('lukas'), f(), deps());
    expect(r.stages.map((s) => s.stage)).toEqual(['NEW', 'CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION', 'WON']);
    expect(Object.fromEntries(r.stages.map((s) => [s.stage, s.reached]))).toEqual(FUNNEL.reached);
    expect(Object.fromEntries(r.stages.map((s) => [s.stage, s.current]))).toEqual(FUNNEL.current);
  });
  it('COLD and LOST are not funnel steps; REP funnel is personal', async () => {
    const r = await getFunnel(await fx.ctx('felix'), f(), deps());
    expect(r.stages.find((s) => s.stage === 'NEW')!.reached).toBe(2);
    expect(r.stages.map((s) => s.stage)).not.toContain('COLD');
  });
});

describe('getStageAging', () => {
  it('averages stage durations with open intervals ending now', async () => {
    const r = await getStageAging(await fx.ctx('lukas'), f({ ownerId: 'lea' }), deps());
    const by = Object.fromEntries(r.rows.map((x) => [x.stage, x]));
    expect(by.NEW).toMatchObject({ avgDays: 0, n: 1, targetDays: 3 });
    expect(by.CONTACTED).toMatchObject({ avgDays: 0.5, n: 1, targetDays: 3 });
    expect(by.QUALIFIED).toMatchObject({ avgDays: 1, n: 1, targetDays: 7 });
    expect(by.TEST_DRIVE).toMatchObject({ avgDays: 2, n: 1, targetDays: 7 });
    expect(by.NEGOTIATION).toMatchObject({ avgDays: 10.6, n: 1, targetDays: 7 });
  });
});

describe('sources, lost reasons, leads over time', () => {
  it('source volume, won/lost by close date, win rate and org rate', async () => {
    const r = await getSources(await fx.ctx('lukas'), f(), deps());
    expect(r.rows[0]).toMatchObject({ source: 'WEBSITE', leads: 5, won: 0, lost: 3, winRatePct: 0 });
    expect(r.rows.find((x) => x.source === 'REFERRAL')).toMatchObject({ leads: 1, won: 1, lost: 0, winRatePct: 100 });
    expect(r.rows.find((x) => x.source === 'PHONE')).toMatchObject({ leads: 1, winRatePct: null });
    expect(r.orgWinRatePct).toBe(25);
  });
  it('lost reasons are sorted descending with shares', async () => {
    const r = await getLostReasons(await fx.ctx('lukas'), f(), deps());
    expect(r.rows).toEqual([
      { reason: 'NOT_READY', count: 2, pct: 66.7 },
      { reason: 'PRICE', count: 1, pct: 33.3 },
    ]);
  });
  it('leads over time stacks by source group with a total per day', async () => {
    const r = await getLeadsOverTime(await fx.ctx('lukas'), f(), deps());
    expect(r.bucket).toBe('day');
    expect(r.rows).toHaveLength(30);
    const totals = (g: string) => r.rows.reduce((a, row) => a + (row[g] as number), 0);
    expect(totals('WEBSITE')).toBe(5);
    expect(totals('SOCIAL')).toBe(2);
    expect(totals('PAID_SEARCH')).toBe(1);
    expect(totals('PORTALS')).toBe(1);
    expect(totals('OFFLINE')).toBe(1);
    expect(totals('REFERRAL')).toBe(1);
    expect(r.rows.reduce((a, row) => a + row.total, 0)).toBe(11);
    expect(r.rows[0]).toMatchObject({ d: '2026-09-01', WEBSITE: 1, total: 1 });
  });
  it('uses week buckets for a 90-day range', async () => {
    const r = await getLeadsOverTime(await fx.ctx('lukas'), f({ range: '90d' }), deps());
    expect(r.bucket).toBe('week');
    expect(r.rows.every((row) => new Date(`${row.d}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
  });
});
