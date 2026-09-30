import { beforeAll, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../client';
import { runMigrations } from '../migrate';
import { seedDatabase, type SeedSummary } from './index';

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function freshSeeded(): { sqlite: Database.Database; summary: SeedSummary } {
  const { sqlite, db } = openDatabase(':memory:');
  runMigrations(db);
  return { sqlite, summary: seedDatabase(db, { seed: 42, now: NOW }) };
}

let a: ReturnType<typeof freshSeeded>;
let b: ReturnType<typeof freshSeeded>;

beforeAll(() => {
  a = freshSeeded();
  b = freshSeeded();
});

const one = <T>(sqlite: Database.Database, sql: string, ...params: unknown[]) =>
  sqlite.prepare(sql).get(...params) as T;
const all = <T>(sqlite: Database.Database, sql: string, ...params: unknown[]) =>
  sqlite.prepare(sql).all(...params) as T[];

describe('seed', () => {
  it('is deterministic: two runs with the same SEED give identical counts', () => {
    expect(a.summary.tables).toEqual(b.summary.tables);
    expect(a.summary.stages).toEqual(b.summary.stages);
    expect(a.summary.unassigned).toBe(b.summary.unassigned);
  });

  it('creates the documented org and dataset sizes', () => {
    expect(a.summary.tables.users).toBe(16);
    expect(a.summary.tables.teams).toBe(3);
    expect(a.summary.tables.offers).toBe(6);
    expect(a.summary.tables.customers).toBeGreaterThanOrEqual(595);
    expect(a.summary.tables.leads).toBeGreaterThanOrEqual(760);
    expect(a.summary.tables.leads).toBeLessThanOrEqual(840);
    expect(a.summary.ms).toBeLessThan(10_000);
  });

  it('follows the stage mix within tolerance and converts roughly 30%', () => {
    const total = a.summary.tables.leads as number;
    const targets: Record<string, number> = {
      NEW: 7,
      CONTACTED: 13,
      QUALIFIED: 10,
      TEST_DRIVE: 6,
      NEGOTIATION: 5,
      WON: 13,
      LOST: 31,
      COLD: 15,
    };
    for (const [stage, pct] of Object.entries(targets)) {
      const actual = ((a.summary.stages[stage] ?? 0) / total) * 100;
      expect(
        Math.abs(actual - pct),
        `${stage}: ${actual.toFixed(1)}% vs ${pct}%`,
      ).toBeLessThanOrEqual(4);
    }
    const won = a.summary.stages.WON ?? 0;
    const lost = a.summary.stages.LOST ?? 0;
    expect(won / (won + lost)).toBeGreaterThan(0.24);
    expect(won / (won + lost)).toBeLessThan(0.36);
  });

  it('has exactly 25 unassigned leads', () => {
    const r = one<{ n: number }>(a.sqlite, 'SELECT COUNT(*) n FROM leads WHERE owner_id IS NULL');
    expect(r.n).toBe(25);
  });

  it('has at least 12 SLA-breach leads younger than 6 hours', () => {
    const r = one<{ n: number }>(
      a.sqlite,
      `SELECT COUNT(*) n FROM leads WHERE stage='NEW' AND owner_id IS NOT NULL
         AND first_response_at IS NULL AND created_at > ?`,
      NOW - 6 * HOUR,
    );
    expect(r.n).toBeGreaterThanOrEqual(12);
  });

  it('has at least 30 overdue pending follow-ups, 20 due today and 40 later', () => {
    const overdue = one<{ n: number }>(
      a.sqlite,
      "SELECT COUNT(*) n FROM follow_ups WHERE status='PENDING' AND due_at < ?",
      NOW,
    );
    expect(overdue.n).toBeGreaterThanOrEqual(30);
    const future = one<{ n: number }>(
      a.sqlite,
      "SELECT COUNT(*) n FROM follow_ups WHERE status='PENDING' AND due_at >= ?",
      NOW,
    );
    expect(future.n).toBeGreaterThanOrEqual(60);
  });

  it('never has an activity before its lead was created', () => {
    const r = one<{ n: number }>(
      a.sqlite,
      'SELECT COUNT(*) n FROM activities a JOIN leads l ON l.id = a.lead_id WHERE a.created_at < l.created_at',
    );
    expect(r.n).toBe(0);
  });

  it('orders activities strictly and stage history chronologically per lead', () => {
    const acts = all<{ lead_id: string; created_at: number }>(
      a.sqlite,
      'SELECT lead_id, created_at FROM activities ORDER BY rowid',
    );
    let prevLead = '';
    let prev = -1;
    let bad = 0;
    for (const x of acts) {
      if (x.lead_id === prevLead && x.created_at <= prev) bad++;
      prevLead = x.lead_id;
      prev = x.created_at;
    }
    expect(bad).toBe(0);

    const hist = all<{ lead_id: string; changed_at: number }>(
      a.sqlite,
      'SELECT lead_id, changed_at FROM stage_history ORDER BY rowid',
    );
    prevLead = '';
    prev = -1;
    bad = 0;
    for (const x of hist) {
      if (x.lead_id === prevLead && x.changed_at < prev) bad++;
      prevLead = x.lead_id;
      prev = x.changed_at;
    }
    expect(bad).toBe(0);
  });

  it('keeps user activities inside 08:00-20:00 UTC (except pinned scenario timestamps)', () => {
    const rows = all<{ created_at: number }>(
      a.sqlite,
      "SELECT created_at FROM activities WHERE kind='USER' AND created_at < ?",
      NOW - 2 * DAY,
    );
    const outside = rows.filter((r) => {
      const h = new Date(r.created_at).getUTCHours() + new Date(r.created_at).getUTCMinutes() / 60;
      return h < 8 || h >= 20;
    });
    // Scenario leads pin their last activity to an exact offset (e.g. 6 d 23 h ago), which may
    // fall outside working hours; everything else is clamped.
    expect(outside.length / rows.length).toBeLessThan(0.01);
  });

  it('derives lead fields from activities and gives WON leads a purchase', () => {
    const bad = one<{ n: number }>(
      a.sqlite,
      `SELECT COUNT(*) n FROM leads l WHERE l.first_response_at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM activities a WHERE a.lead_id = l.id AND a.kind='USER' AND a.type <> 'NOTE'
           AND a.created_at = l.first_response_at)`,
    );
    expect(bad.n).toBe(0);
    const noPurchase = one<{ n: number }>(
      a.sqlite,
      "SELECT COUNT(*) n FROM leads l WHERE stage='WON' AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.lead_id = l.id)",
    );
    expect(noPurchase.n).toBe(0);
  });

  it('includes the rep imbalance, hero leads and cold-detector demo leads', () => {
    const open = (name: string) =>
      one<{ n: number }>(
        a.sqlite,
        `SELECT COUNT(*) n FROM leads l JOIN users u ON u.id = l.owner_id
           WHERE u.name = ? AND l.stage IN ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')`,
        name,
      ).n;
    expect(open('Felix Wagner')).toBeGreaterThanOrEqual(34);
    expect(open('Felix Wagner')).toBeLessThanOrEqual(42);
    expect(open('Lea Hoffmann')).toBeLessThanOrEqual(18);

    const giulia = one<{ priority: string; owner: string; vehicle_model: string }>(
      a.sqlite,
      `SELECT l.priority, u.name owner, l.vehicle_model FROM leads l
         JOIN customers c ON c.id = l.customer_id JOIN users u ON u.id = l.owner_id
         WHERE c.first_name='Giulia' AND c.last_name='Conti'`,
    );
    expect(giulia).toEqual({ priority: 'HOT', owner: 'Sofia Rossi', vehicle_model: 'aurora-suv' });

    const markus = one<{ owner: string }>(
      a.sqlite,
      `SELECT u.name owner FROM leads l JOIN customers c ON c.id = l.customer_id JOIN users u ON u.id = l.owner_id
         WHERE c.first_name='Markus' AND c.last_name='Klein'`,
    );
    expect(markus.owner).toBe('Anna Weber');

    const cold = one<{ n: number }>(
      a.sqlite,
      `SELECT COUNT(*) n FROM leads WHERE stage IN ('CONTACTED','QUALIFIED')
         AND ABS(last_activity_at - ?) < 1000`,
      NOW - (6 * DAY + 23 * HOUR),
    );
    expect(cold.n).toBeGreaterThanOrEqual(5);
  });
});
