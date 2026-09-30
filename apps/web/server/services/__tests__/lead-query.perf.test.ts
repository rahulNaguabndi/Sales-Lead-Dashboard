import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { openDatabase, type Db } from '../../db/client';
import { runMigrations } from '../../db/migrate';
import { seedDatabase } from '../../db/seed';
import type { CurrentUser } from '../../policy';
import { listLeads } from '../lead-query';

// SC-001: p95 < 300 ms across views and sorts with ~800 seeded leads.
let db: Db;
let now: number;
let vp: CurrentUser;
let rep: CurrentUser;

beforeAll(() => {
  db = openDatabase(':memory:').db;
  runMigrations(db);
  now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  seedDatabase(db, { seed: 42, now, baseLeads: 800, silent: true });
  const load = (name: string) => {
    const r = db.get<{
      id: string;
      name: string;
      email: string;
      role: CurrentUser['role'];
      team_id: string | null;
    }>(sql`SELECT id, name, email, role, team_id FROM users WHERE name = ${name}`)!;
    return { id: r.id, name: r.name, email: r.email, role: r.role, teamId: r.team_id };
  };
  vp = load('Isabelle Laurent');
  rep = load('Sofia Rossi');
});

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]!;

describe('listLeads performance (SC-001)', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['rank / all', { view: 'all' }],
    ['unassigned', { view: 'unassigned' }],
    ['due_today', { view: 'due_today' }],
    ['going_cold', { view: 'going_cold' }],
    ['next_follow_up sort', { view: 'all', sort: 'next_follow_up' }],
    ['score sort', { view: 'all', sort: 'score' }],
    ['last_activity sort', { view: 'all', sort: 'last_activity' }],
    ['search', { view: 'all', q: 'an' }],
    ['filters', { view: 'all', sourceGroup: 'SOCIAL', priority: 'HOT,WARM', overdue: 'true' }],
  ];
  for (const [label, q] of cases) {
    it(`${label}: p95 < 300 ms`, async () => {
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        await listLeads(vp, q, { db, now });
        times.push(performance.now() - t0);
      }
      expect(p95(times)).toBeLessThan(300);
    });
  }

  it('REP mine: p95 < 300 ms', async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      await listLeads(rep, {}, { db, now });
      times.push(performance.now() - t0);
    }
    expect(p95(times)).toBeLessThan(300);
  });
});
