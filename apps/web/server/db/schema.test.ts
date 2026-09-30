import { beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from './client';
import { runMigrations } from './migrate';

let sqlite: Database.Database;

function seedMinimal() {
  sqlite.exec(`
    INSERT INTO teams (id, name, region, countries, auto_assign, assign_strategy)
      VALUES ('t1', 'Team DACH', 'DACH', '["DE"]', 1, 'LOAD_BALANCED');
    INSERT INTO users (id, name, email, password_hash, role, languages, avatar_color, created_at)
      VALUES ('u1', 'A', 'a@x.test', 'h', 'REP', '["de"]', 'blue', 1);
    INSERT INTO customers (id, first_name, last_name, email, country, language, preferred_channel, created_at)
      VALUES ('c1', 'A', 'B', 'a@b.test', 'DE', 'de', 'EMAIL', 1);
    INSERT INTO leads (id, reference, customer_id, team_id, source, score_breakdown, created_at, updated_at)
      VALUES ('l1', 'EDM-2026-00001', 'c1', 't1', 'WEBSITE', '{}', 1, 1);
    INSERT INTO activities (id, lead_id, kind, type, note, created_at)
      VALUES ('a1', 'l1', 'SYSTEM', 'LEAD_CREATED', '', 1);
    INSERT INTO audit_log (id, action, entity, entity_id, created_at)
      VALUES ('x1', 'lead.create', 'leads', 'l1', 1);
  `);
}

beforeEach(() => {
  const opened = openDatabase(':memory:');
  sqlite = opened.sqlite;
  runMigrations(opened.db);
});

describe('schema', () => {
  it('applies migrations cleanly and creates all 10 tables', () => {
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%migrations%' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables.sort()).toEqual(
      [
        'activities',
        'audit_log',
        'customers',
        'follow_ups',
        'leads',
        'offers',
        'purchases',
        'stage_history',
        'teams',
        'users',
      ].sort(),
    );
  });

  it('rejects a customer with neither email nor phone', () => {
    expect(() =>
      sqlite.exec(
        `INSERT INTO customers (id, first_name, last_name, country, language, preferred_channel, created_at)
         VALUES ('c2', 'A', 'B', 'DE', 'de', 'CALL', 1)`,
      ),
    ).toThrow(/CHECK constraint/i);
  });

  it('makes activities append-only', () => {
    seedMinimal();
    expect(() => sqlite.exec("UPDATE activities SET note='x' WHERE id='a1'")).toThrow(
      /append-only table/,
    );
    expect(() => sqlite.exec("DELETE FROM activities WHERE id='a1'")).toThrow(/append-only table/);
  });

  it('makes audit_log append-only', () => {
    seedMinimal();
    expect(() => sqlite.exec("UPDATE audit_log SET action='x' WHERE id='x1'")).toThrow(
      /append-only table/,
    );
    expect(() => sqlite.exec("DELETE FROM audit_log WHERE id='x1'")).toThrow(/append-only table/);
  });
});
