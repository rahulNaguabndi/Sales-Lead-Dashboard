import type Database from 'better-sqlite3';
import { openDatabase, type Db } from '../../db/client';
import { runMigrations } from '../../db/migrate';
import type { CurrentUser } from '../types';
import type { Role, Stage } from '@leaddesk/shared';

export type FixtureLead = { id: string; ownerId: string | null; teamId: string; stage: Stage };

export type Fixture = {
  sqlite: Database.Database;
  db: Db;
  users: Record<string, CurrentUser>;
  leads: Record<string, FixtureLead>;
};

type U = {
  id: string;
  name: string;
  role: Role;
  managerId: string | null;
  teamId: string | null;
  active?: boolean;
};

export function freshDb(): { sqlite: Database.Database; db: Db } {
  const opened = openDatabase(':memory:');
  runMigrations(opened.db);
  return opened;
}

export function insertUser(sqlite: Database.Database, u: U): void {
  sqlite
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, role, manager_id, team_id, languages, avatar_color, is_active, max_open_leads, created_at)
       VALUES (?, ?, ?, 'h', ?, ?, ?, '["en"]', 'blue', ?, 25, 1)`,
    )
    .run(u.id, u.name, `${u.id}@x.test`, u.role, u.managerId, u.teamId, u.active === false ? 0 : 1);
}

function toCurrentUser(u: U): CurrentUser {
  return { id: u.id, name: u.name, email: `${u.id}@x.test`, role: u.role, teamId: u.teamId };
}

const rep = (id: string, managerId: string, teamId: string, active = true): U => ({
  id,
  name: id,
  role: 'REP',
  managerId,
  teamId,
  active,
});

/** Mirrors the seeded org: VP, 3 managers, 12 reps = 16 users, 3 teams. Felix is inactive. */
const ORG: U[] = [
  { id: 'isabelle', name: 'Isabelle', role: 'VP', managerId: null, teamId: null },
  { id: 'lukas', name: 'Lukas', role: 'MANAGER', managerId: 'isabelle', teamId: 'dach' },
  { id: 'claire', name: 'Claire', role: 'MANAGER', managerId: 'isabelle', teamId: 'west' },
  { id: 'marco', name: 'Marco', role: 'MANAGER', managerId: 'isabelle', teamId: 'south' },
  rep('anna', 'lukas', 'dach'),
  rep('jonas', 'lukas', 'dach'),
  rep('lea', 'lukas', 'dach'),
  rep('felix', 'lukas', 'dach', false),
  rep('emile', 'claire', 'west'),
  rep('jan', 'claire', 'west'),
  rep('camille', 'claire', 'west'),
  rep('thomas', 'claire', 'west'),
  rep('sofia', 'marco', 'south'),
  rep('marta', 'marco', 'south'),
  rep('luca', 'marco', 'south'),
  rep('joao', 'marco', 'south'),
];

const LEADS: FixtureLead[] = [
  { id: 'L1', ownerId: 'anna', teamId: 'dach', stage: 'CONTACTED' },
  { id: 'L2', ownerId: 'sofia', teamId: 'south', stage: 'NEW' },
  { id: 'L3', ownerId: null, teamId: 'dach', stage: 'NEW' },
  { id: 'L4', ownerId: null, teamId: 'south', stage: 'NEW' },
  { id: 'L5', ownerId: 'anna', teamId: 'dach', stage: 'WON' },
  { id: 'L6', ownerId: 'felix', teamId: 'dach', stage: 'NEW' },
  { id: 'L7', ownerId: null, teamId: 'west', stage: 'NEW' },
  { id: 'L8', ownerId: 'lukas', teamId: 'dach', stage: 'QUALIFIED' },
  { id: 'L9', ownerId: 'emile', teamId: 'west', stage: 'LOST' },
];

export function createFixture(): Fixture {
  const { sqlite, db } = freshDb();
  for (const [id, region] of [
    ['dach', 'DACH'],
    ['west', 'WEST'],
    ['south', 'SOUTH'],
  ] as const) {
    sqlite
      .prepare(
        `INSERT INTO teams (id, name, region, countries, auto_assign, assign_strategy) VALUES (?, ?, ?, '[]', 1, 'LOAD_BALANCED')`,
      )
      .run(id, `Team ${region}`, region);
  }
  for (const u of ORG) insertUser(sqlite, u);
  for (const [team, mgr] of [
    ['dach', 'lukas'],
    ['west', 'claire'],
    ['south', 'marco'],
  ] as const) {
    sqlite.prepare('UPDATE teams SET manager_id = ? WHERE id = ?').run(mgr, team);
  }
  sqlite.exec(
    `INSERT INTO customers (id, first_name, last_name, email, country, language, preferred_channel, created_at)
     VALUES ('c1', 'A', 'B', 'a@b.test', 'DE', 'de', 'EMAIL', 1)`,
  );
  const insertLead = sqlite.prepare(
    `INSERT INTO leads (id, reference, customer_id, team_id, owner_id, source, stage, score_breakdown, created_at, updated_at)
     VALUES (?, ?, 'c1', ?, ?, 'WEBSITE', ?, '{}', 1, 1)`,
  );
  for (const l of LEADS) insertLead.run(l.id, `REF-${l.id}`, l.teamId, l.ownerId, l.stage);

  return {
    sqlite,
    db,
    users: Object.fromEntries(ORG.map((u) => [u.id, toCurrentUser(u)])),
    leads: Object.fromEntries(LEADS.map((l) => [l.id, l])),
  };
}

/** Adds `n` open leads owned by `ownerId` (for claim-limit tests). */
export function addOpenLeads(fx: Fixture, ownerId: string, n: number): void {
  const stmt = fx.sqlite.prepare(
    `INSERT INTO leads (id, reference, customer_id, team_id, owner_id, source, stage, score_breakdown, created_at, updated_at)
     VALUES (?, ?, 'c1', 'dach', ?, 'WEBSITE', 'NEW', '{}', 1, 1)`,
  );
  for (let i = 0; i < n; i++) stmt.run(`X-${ownerId}-${i}`, `XREF-${ownerId}-${i}`, ownerId);
}

/** A 4-level chain: top -> mid -> low -> leaf. */
export function buildFourLevels(): { db: Db; ids: string[] } {
  const { sqlite, db } = freshDb();
  const ids = ['top', 'mid', 'low', 'leaf'];
  ids.forEach((id, i) =>
    insertUser(sqlite, {
      id,
      name: id,
      role: i === 0 ? 'VP' : i === 3 ? 'REP' : 'MANAGER',
      managerId: i === 0 ? null : ids[i - 1]!,
      teamId: null,
    }),
  );
  return { db, ids };
}

/** a <-> b manager cycle plus a child c of b. */
export function buildCycle(): { db: Db } {
  const { sqlite, db } = freshDb();
  insertUser(sqlite, { id: 'a', name: 'a', role: 'MANAGER', managerId: null, teamId: null });
  insertUser(sqlite, { id: 'b', name: 'b', role: 'MANAGER', managerId: 'a', teamId: null });
  insertUser(sqlite, { id: 'c', name: 'c', role: 'REP', managerId: 'b', teamId: null });
  sqlite.prepare("UPDATE users SET manager_id = 'b' WHERE id = 'a'").run();
  return { db };
}

/** A 1,000-user tree: 1 root, 9 managers, 990 reps. */
export function buildLargeTree(): { db: Db; rootId: string } {
  const { sqlite, db } = freshDb();
  sqlite.exec(
    `INSERT INTO teams (id, name, region, countries, auto_assign, assign_strategy) VALUES ('big', 'Big', 'DACH', '[]', 1, 'LOAD_BALANCED')`,
  );
  sqlite.transaction(() => {
    insertUser(sqlite, { id: 'root', name: 'root', role: 'VP', managerId: null, teamId: 'big' });
    for (let m = 0; m < 9; m++) {
      insertUser(sqlite, {
        id: `m${m}`,
        name: `m${m}`,
        role: 'MANAGER',
        managerId: 'root',
        teamId: 'big',
      });
    }
    for (let r = 0; r < 990; r++) {
      insertUser(sqlite, {
        id: `r${r}`,
        name: `r${r}`,
        role: 'REP',
        managerId: `m${r % 9}`,
        teamId: 'big',
      });
    }
  })();
  return { db, rootId: 'root' };
}
