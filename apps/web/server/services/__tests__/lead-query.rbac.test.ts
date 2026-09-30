import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type Db } from '../../db/client';
import { runMigrations } from '../../db/migrate';
import { seedDatabase } from '../../db/seed';
import { resolveScope, leadScopeWhere, type CurrentUser } from '../../policy';
import { listLeads, listScopeOwners, type LeadListItem } from '../lead-query';

let db: Db;
let now: number;
const users: Record<string, CurrentUser> = {};
const byName: Record<string, string> = {};

const VIEWS = ['mine', 'unassigned', 'due_today', 'going_cold', 'team', 'all'] as const;

beforeAll(() => {
  const opened = openDatabase(':memory:');
  db = opened.db;
  runMigrations(db);
  now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  seedDatabase(db, { seed: 42, now, silent: true });
  const rows = db.all<{
    id: string;
    name: string;
    email: string;
    role: CurrentUser['role'];
    team_id: string | null;
  }>(sql`SELECT id, name, email, role, team_id FROM users`);
  for (const r of rows) {
    byName[r.name] = r.id;
    users[r.name] = { id: r.id, name: r.name, email: r.email, role: r.role, teamId: r.team_id };
  }
});

const run = (name: string, q: Record<string, unknown> = {}) =>
  listLeads(users[name]!, q, { db, now });

async function allRows(name: string, q: Record<string, unknown>): Promise<LeadListItem[]> {
  const first = await run(name, { ...q, pageSize: 50, page: 1 });
  const pages = Math.ceil(first.total / 50);
  const out = [...first.items];
  for (let p = 2; p <= pages; p++)
    out.push(...(await run(name, { ...q, pageSize: 50, page: p })).items);
  return out;
}

async function inScope(name: string, items: LeadListItem[]): Promise<boolean> {
  const scope = await resolveScope(users[name]!.id, db);
  const teams = new Map(
    db
      .all<{ id: string; team_id: string }>(sql`SELECT id, team_id FROM leads`)
      .map((l) => [l.id, l.team_id]),
  );
  return items.every((i) =>
    scope.isOrgWide
      ? true
      : i.owner
        ? scope.userIds.has(i.owner.id)
        : scope.teamIds.has(teams.get(i.id)!),
  );
}

describe('RBAC matrix (SC-003)', () => {
  for (const who of ['Sofia Rossi', 'Lukas Becker', 'Isabelle Laurent']) {
    for (const view of VIEWS) {
      it(`${who} / ${view}: only in-scope leads`, async () => {
        const items = await allRows(who, { view });
        expect(await inScope(who, items)).toBe(true);
      });
    }
  }

  it('REP never sees another rep’s owned leads in any view', async () => {
    const sofia = users['Sofia Rossi']!;
    for (const view of VIEWS) {
      const items = await allRows('Sofia Rossi', { view, closed: 'true' });
      for (const i of items) expect(i.owner === null || i.owner.id === sofia.id).toBe(true);
    }
  });

  it('out-of-scope owner filter returns 0 foreign rows (US-5.1)', async () => {
    // A manager passing another team’s rep, and a rep passing anyone (ignored for REP).
    const res = await run('Lukas Becker', { owner: byName['Sofia Rossi'] });
    expect(res.total).toBe(0);
    const rep = await allRows('Sofia Rossi', { owner: byName['Anna Weber'] });
    expect(rep.every((i) => i.owner === null || i.owner.id === byName['Sofia Rossi'])).toBe(true);
  });

  it('team filter is VP only; others cannot widen their scope', async () => {
    const dach = users['Anna Weber']!.teamId!;
    const mgr = await allRows('Lukas Becker', { team: dach });
    expect(await inScope('Lukas Becker', mgr)).toBe(true);
    const sofiaRows = await allRows('Sofia Rossi', { team: dach });
    expect(await inScope('Sofia Rossi', sofiaRows)).toBe(true);
    const vp = await run('Isabelle Laurent', { team: dach });
    expect(vp.total).toBeGreaterThan(0);
    expect(vp.items.every((i) => i.owner?.name !== 'Sofia Rossi')).toBe(true);
  });

  it('VP sees all three teams (US-5.2)', async () => {
    const items = await allRows('Isabelle Laurent', { view: 'all', closed: 'true' });
    const teams = new Set(
      db
        .all<{ id: string; team_id: string }>(sql`SELECT id, team_id FROM leads`)
        .filter((l) => items.some((i) => i.id === l.id))
        .map((l) => l.team_id),
    );
    expect(teams.size).toBe(3);
  });

  it('leadScopeWhere agrees with the list (direct SQL cross-check)', async () => {
    const scope = await resolveScope(users['Lukas Becker']!.id, db);
    const n = db.get<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM leads WHERE ${leadScopeWhere(scope)} AND stage IN ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')`,
    )!.n;
    expect((await run('Lukas Becker', { view: 'team' })).total).toBe(n);
  });

  it('rejects invalid params with a ZodError', async () => {
    await expect(run('Sofia Rossi', { stage: 'NOPE' })).rejects.toThrow();
    await expect(run('Sofia Rossi', { pageSize: '7' })).rejects.toThrow();
  });

  it('owner options are scoped and empty for REP', async () => {
    expect(await listScopeOwners(users['Sofia Rossi']!, { db })).toEqual([]);
    const owners = await listScopeOwners(users['Lukas Becker']!, { db });
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.map((o) => o.name)).not.toContain('Sofia Rossi');
  });
});

describe('list behaviour', () => {
  it('Sofia defaults to mine, open leads only, 25 per page (US-1.1)', async () => {
    const res = await run('Sofia Rossi');
    expect(res.view).toBe('mine');
    expect(res.items.length).toBe(Math.min(25, res.total));
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((i) => !['WON', 'LOST', 'COLD'].includes(i.stage))).toBe(true);
    expect(res.counts.mine).toBe(res.total);
  });

  it('pagination: pages sum to total, no duplicates, page clamps (SC-005)', async () => {
    const first = await run('Isabelle Laurent', { view: 'all', pageSize: 10 });
    const seen = new Set<string>();
    for (let p = 1; p <= Math.ceil(first.total / 10); p++) {
      const r = await run('Isabelle Laurent', { view: 'all', pageSize: 10, page: p });
      r.items.forEach((i) => seen.add(i.id));
    }
    expect(seen.size).toBe(first.total);
    const past = await run('Isabelle Laurent', { view: 'all', pageSize: 10, page: 9999 });
    expect(past.page).toBe(Math.ceil(first.total / 10));
    expect(past.items.length).toBeGreaterThan(0);
  });

  it('default ranking puts overdue, then SLA breach, before the rest', async () => {
    const items = await allRows('Isabelle Laurent', { view: 'all' });
    const flags = items.map((i) => (i.flags.overdue ? 0 : i.flags.slaBreach ? 1 : 2));
    expect(flags).toEqual([...flags].sort((a, b) => a - b));
    const plain = items.filter((i) => !i.flags.overdue && !i.flags.slaBreach);
    for (let k = 1; k < plain.length; k++) {
      const a = plain[k - 1]!;
      const b = plain[k]!;
      expect(a.score > b.score || (a.score === b.score && a.createdAt >= b.createdAt)).toBe(true);
    }
  });

  it('newest sort orders by created_at DESC', async () => {
    const items = (await run('Isabelle Laurent', { view: 'all', sort: 'newest', pageSize: 50 }))
      .items;
    for (let k = 1; k < items.length; k++)
      expect(items[k - 1]!.createdAt).toBeGreaterThanOrEqual(items[k]!.createdAt);
  });

  it('unassigned view has only owner-less leads; due_today includes overdue', async () => {
    const un = await allRows('Lukas Becker', { view: 'unassigned' });
    expect(un.every((i) => i.owner === null)).toBe(true);
    const due = await allRows('Lukas Becker', { view: 'due_today' });
    expect(due.every((i) => i.nextFollowUpAt !== null)).toBe(true);
    const overdue = await allRows('Lukas Becker', { overdue: 'true' });
    expect(overdue.every((i) => i.flags.overdue)).toBe(true);
    const dueIds = new Set(due.map((i) => i.id));
    expect(overdue.every((i) => dueIds.has(i.id))).toBe(true);
  });

  it('going_cold lists only 3+ day quiet open leads, oldest first', async () => {
    const cold = await allRows('Lukas Becker', { view: 'going_cold' });
    const rows = db.all<{ id: string; t: number }>(
      sql`SELECT id, COALESCE(last_contact_at, created_at) AS t FROM leads`,
    );
    const t = new Map(rows.map((r) => [r.id, r.t]));
    for (const i of cold) expect(now - t.get(i.id)!).toBeGreaterThanOrEqual(3 * 86_400_000);
    for (let k = 1; k < cold.length; k++)
      expect(t.get(cold[k - 1]!.id)!).toBeLessThanOrEqual(t.get(cold[k]!.id)!);
  });

  it('filters combine with AND; stage filter can surface closed leads', async () => {
    const res = await allRows('Isabelle Laurent', { stage: 'WON' });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((i) => i.stage === 'WON')).toBe(true);
    const social = await allRows('Isabelle Laurent', { sourceGroup: 'SOCIAL', priority: 'HOT' });
    expect(
      social.every((i) => ['FACEBOOK', 'INSTAGRAM'].includes(i.source) && i.priority === 'HOT'),
    ).toBe(true);
    const ret = await allRows('Isabelle Laurent', { returning: 'true' });
    expect(ret.every((i) => i.customer.isReturning)).toBe(true);
  });

  it('search is accent- and case-insensitive and matches reference prefix', async () => {
    const hero = await run('Sofia Rossi', { q: 'CONTI' });
    expect(hero.items.some((i) => i.customer.name === 'Giulia Conti')).toBe(true);
    const ref = hero.items[0]!.reference;
    const byRef = await run('Isabelle Laurent', { q: ref, view: 'all', closed: 'true' });
    expect(byRef.items.some((i) => i.reference === ref)).toBe(true);
  });

  it('SLA breach flag: NEW, uncontacted, past target', async () => {
    const breached = await allRows('Isabelle Laurent', { sla: 'breached', view: 'all' });
    expect(breached.every((i) => i.stage === 'NEW' && i.flags.slaBreach)).toBe(true);
  });

  it('rows carry last activity summary and owner', async () => {
    const res = await run('Sofia Rossi', { pageSize: 50 });
    expect(res.items.some((i) => i.lastActivity !== null)).toBe(true);
    expect(res.items.every((i) => i.owner?.name === 'Sofia Rossi')).toBe(true);
  });

  it('counts are stable across views for the same user', async () => {
    const a = await run('Lukas Becker', { view: 'team' });
    const b = await run('Lukas Becker', { view: 'unassigned' });
    expect(a.counts).toEqual(b.counts);
  });
});
