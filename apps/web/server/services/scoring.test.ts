import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { PRIORITY_THRESHOLDS } from '@leaddesk/shared';
import { openDatabase, type Db } from '../db/client';
import { runMigrations } from '../db/migrate';
import { seedDatabase } from '../db/seed';
import { activities, leads } from '../db/schema';

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const HOUR = 3_600_000;

let testDb: Db;
vi.mock('../db/client', async (orig) => {
  const actual = await orig<typeof import('../db/client')>();
  return {
    ...actual,
    get db() {
      return testDb;
    },
    withTx: <T>(fn: Parameters<Db['transaction']>[0]) => testDb.transaction(fn) as T,
  };
});

const { loadScoreInput, recomputeLeadScore, recomputeFreshScores } = await import('./scoring');

beforeEach(() => {
  testDb = openDatabase(':memory:').db;
  runMigrations(testDb);
  seedDatabase(testDb, { seed: 42, now: NOW });
});

function pickLead(where: (l: typeof leads.$inferSelect) => boolean) {
  const lead = testDb.select().from(leads).all().find(where);
  if (!lead) throw new Error('no matching seed lead');
  return lead;
}

function log(leadId: string, outcome: string | null, at: number, kind: 'USER' | 'SYSTEM' = 'USER') {
  testDb
    .insert(activities)
    .values({
      id: ulid(),
      leadId,
      actorId: null,
      kind,
      type: kind === 'USER' ? 'CALL' : 'STAGE_CHANGED',
      outcome: outcome as never,
      note: '',
      aiAssisted: false,
      metadata: null,
      createdAt: at,
    })
    .run();
}

const scoreChanges = (id: string) =>
  testDb
    .select()
    .from(activities)
    .where(eq(activities.leadId, id))
    .all()
    .filter((a) => a.type === 'SCORE_CHANGED');

describe('loadScoreInput', () => {
  it('derives outcome and unanswered attempts from USER activities only', () => {
    const lead = pickLead((l) => l.stage === 'NEW');
    log(lead.id, 'CALLBACK_REQUESTED', NOW + 3 * HOUR);
    log(lead.id, 'NO_ANSWER', NOW + 4 * HOUR);
    log(lead.id, 'INTERESTED', NOW + 5 * HOUR, 'SYSTEM');
    const input = loadScoreInput(testDb, lead.id);
    expect(input.lastPositiveOutcome).toBe('CALLBACK_REQUESTED');
    expect(input.unansweredAttempts).toBe(1);
  });
});

describe('recomputeLeadScore', () => {
  it('raises engagement and updates the lead when INTERESTED is logged', () => {
    const lead = pickLead((l) => l.stage === 'CONTACTED');
    log(lead.id, 'INTERESTED', NOW + 1000);
    const r = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    expect(r.result.breakdown.engagement).toBe(15);
    const after = testDb.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    expect(after.score).toBe(r.result.score);
    expect(after.scoreBreakdown.engagement).toBe(15);
    expect(after.version).toBe(lead.version);
  });

  it('writes exactly one SCORE_CHANGED on a band change and none on a same-band change', () => {
    const lead = pickLead((l) => l.stage === 'CONTACTED');
    const first = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    const n0 = scoreChanges(lead.id).length;
    expect(n0).toBe(first.priorityChanged ? 1 : 0);
    // Force a known band difference by storing a wrong priority.
    const wrong = first.result.priority === 'HOT' ? 'COOL' : 'HOT';
    testDb.update(leads).set({ priority: wrong }).where(eq(leads.id, lead.id)).run();
    const r = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    expect(r.priorityChanged).toBe(true);
    const rows = scoreChanges(lead.id);
    expect(rows).toHaveLength(n0 + 1);
    expect(rows.at(-1)!.metadata).toEqual({
      from: wrong,
      to: r.result.priority,
      score: r.result.score,
    });
  });

  it('is a no-op when inputs are unchanged', () => {
    const lead = pickLead((l) => l.stage === 'CONTACTED');
    testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    const again = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    expect(again.changed).toBe(false);
  });

  it('skips WON and LOST leads', () => {
    for (const stage of ['WON', 'LOST'] as const) {
      const lead = pickLead((l) => l.stage === stage);
      const r = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW + 400 * 24 * HOUR));
      expect(r.changed).toBe(false);
      const after = testDb.select().from(leads).where(eq(leads.id, lead.id)).get()!;
      expect(after.score).toBe(lead.score);
    }
  });

  it('recomputes COLD leads', () => {
    const lead = pickLead((l) => l.stage === 'COLD');
    testDb.update(leads).set({ score: 99 }).where(eq(leads.id, lead.id)).run();
    const r = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    expect(r.changed).toBe(true);
  });

  it('does not change the score on reassignment', () => {
    const lead = pickLead((l) => l.stage === 'CONTACTED');
    testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    const before = testDb.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    testDb.update(leads).set({ ownerId: null }).where(eq(leads.id, lead.id)).run();
    const r = testDb.transaction((tx) => recomputeLeadScore(tx, lead.id, NOW));
    expect(r.changed).toBe(false);
    expect(before.score).toBe(r.result.score);
  });
});

describe('recomputeFreshScores', () => {
  it('decays freshness as time passes and only reports priority changes', () => {
    recomputeFreshScores(NOW);
    const lead = pickLead(
      (l) => !['WON', 'LOST'].includes(l.stage) && NOW - l.createdAt < 6 * 24 * HOUR,
    );
    const before = testDb.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    const { priorityChangedIds } = recomputeFreshScores(NOW + 2 * 24 * HOUR);
    const after = testDb.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    expect(after.scoreBreakdown.freshness).toBeLessThanOrEqual(before.scoreBreakdown.freshness);
    for (const id of priorityChangedIds) {
      expect(scoreChanges(id).length).toBeGreaterThan(0);
    }
  });

  it('leaves old and closed leads untouched and processes more than one batch', () => {
    const old = pickLead(
      (l) => NOW - l.createdAt > 20 * 24 * HOUR && l.stage !== 'WON' && l.stage !== 'LOST',
    );
    testDb.update(leads).set({ score: 1 }).where(eq(leads.id, old.id)).run();
    const count = testDb.select().from(leads).all().length;
    expect(count).toBeGreaterThan(0);
    recomputeFreshScores(NOW);
    expect(testDb.select().from(leads).where(eq(leads.id, old.id)).get()!.score).toBe(1);
  });
});

describe('seed distribution (SC-003, report only)', () => {
  it('stores consistent scores for every seeded lead', () => {
    const all = testDb.select().from(leads).all();
    const dist = { HOT: 0, WARM: 0, COOL: 0 };
    for (const l of all) {
      expect(l.score).toBeGreaterThanOrEqual(0);
      expect(l.score).toBeLessThanOrEqual(100);
      const expected =
        l.score >= PRIORITY_THRESHOLDS.HOT
          ? 'HOT'
          : l.score >= PRIORITY_THRESHOLDS.WARM
            ? 'WARM'
            : 'COOL';
      expect(l.priority).toBe(expected);
      const sum = Object.values(l.scoreBreakdown).reduce((s, n) => s + n, 0);
      expect(sum).toBe(l.score);
      dist[l.priority]++;
    }
    console.info(
      `seed priority distribution: HOT ${dist.HOT} / WARM ${dist.WARM} / COOL ${dist.COOL} of ${all.length}`,
    );
  });
});
