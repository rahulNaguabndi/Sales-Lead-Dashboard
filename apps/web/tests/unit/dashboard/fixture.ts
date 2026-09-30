import type Database from 'better-sqlite3';
import type { Role, Stage } from '@leaddesk/shared';
import type { Db } from '@/server/db/client';
import { freshDb, insertUser } from '@/server/policy/__tests__/fixtures';
import { resolveScope, type CurrentUser } from '@/server/policy';
import type { DashboardCtx } from '@/server/services/dashboard';

/** 2026-09-30 10:00 UTC = 12:00 Brussels (CEST). Current 30d period: Sep 1–30; previous: Aug 2–31. */
export const NOW = Date.UTC(2026, 8, 30, 10, 0, 0);
export const at = (month: number, day: number, hour = 8, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute);
const MIN = 60_000;
const HOUR = 3_600_000;

type L = {
  id: string;
  team: 'dach' | 'west' | 'south';
  owner: string | null;
  source?: string;
  stage?: Stage;
  created: number;
  priority?: string;
  /** minutes from creation to the first contact activity (also sets first_response_at) */
  contactMin?: number;
  noteOnly?: boolean;
  closed?: number;
  deal?: number;
  lost?: string;
  budgetMax?: number;
  lastContact?: number;
  /** [stage, ms offset from created] */
  history?: [Stage, number][];
  followUps?: number[];
};

const ORG: { id: string; role: Role; manager: string | null; team: string | null }[] = [
  { id: 'isabelle', role: 'VP', manager: null, team: null },
  { id: 'lukas', role: 'MANAGER', manager: 'isabelle', team: 'dach' },
  { id: 'claire', role: 'MANAGER', manager: 'isabelle', team: 'west' },
  { id: 'marco', role: 'MANAGER', manager: 'isabelle', team: 'south' },
  { id: 'anna', role: 'REP', manager: 'lukas', team: 'dach' },
  { id: 'felix', role: 'REP', manager: 'lukas', team: 'dach' },
  { id: 'jonas', role: 'REP', manager: 'lukas', team: 'dach' },
  { id: 'lea', role: 'REP', manager: 'lukas', team: 'dach' },
  { id: 'emile', role: 'REP', manager: 'claire', team: 'west' },
  { id: 'sofia', role: 'REP', manager: 'marco', team: 'south' },
];

// Hand-computed expectations live in fixture.expected.ts.
const LEADS: L[] = [
  // ---- Team DACH, current period ----
  { id: 'D1', team: 'dach', owner: 'anna', source: 'WEBSITE', stage: 'NEW', created: at(9, 10) },
  {
    id: 'D2',
    team: 'dach',
    owner: 'anna',
    source: 'FACEBOOK',
    stage: 'CONTACTED',
    created: at(9, 11),
    contactMin: 30,
    history: [
      ['NEW', 0],
      ['CONTACTED', 30 * MIN],
    ],
  },
  {
    id: 'D3',
    team: 'dach',
    owner: 'anna',
    source: 'REFERRAL',
    stage: 'WON',
    created: at(9, 12),
    contactMin: 60,
    closed: at(9, 20),
    deal: 3_890_000,
    history: [
      ['NEW', 0],
      ['CONTACTED', HOUR],
      ['QUALIFIED', 2 * HOUR],
      ['WON', 5 * HOUR],
    ],
  },
  {
    id: 'D4',
    team: 'dach',
    owner: 'jonas',
    source: 'WEBSITE',
    stage: 'LOST',
    created: at(9, 13),
    contactMin: 120,
    closed: at(9, 22),
    lost: 'PRICE',
    history: [
      ['NEW', 0],
      ['CONTACTED', 2 * HOUR],
      ['LOST', 4 * HOUR],
    ],
  },
  {
    id: 'D5',
    team: 'dach',
    owner: 'jonas',
    source: 'INSTAGRAM',
    stage: 'QUALIFIED',
    created: at(9, 14),
    noteOnly: true,
    budgetMax: 2_500_000,
    history: [
      ['NEW', 0],
      ['CONTACTED', HOUR],
      ['QUALIFIED', 2 * HOUR],
      ['CONTACTED', 3 * HOUR],
      ['QUALIFIED', 4 * HOUR],
    ],
  },
  {
    id: 'D6',
    team: 'dach',
    owner: 'jonas',
    source: 'WEBSITE',
    stage: 'CONTACTED',
    created: at(9, 15),
    contactMin: 10,
    history: [
      ['NEW', 0],
      ['CONTACTED', 10 * MIN],
    ],
    followUps: [at(9, 25)],
  },
  {
    id: 'D7',
    team: 'dach',
    owner: 'felix',
    source: 'PHONE',
    stage: 'NEW',
    created: at(9, 29, 9),
    priority: 'HOT',
    history: [['NEW', 0]],
    followUps: [at(9, 28), at(9, 29)],
  },
  {
    id: 'D8',
    team: 'dach',
    owner: 'felix',
    source: 'PORTAL',
    stage: 'CONTACTED',
    created: at(9, 16),
    contactMin: 55,
    history: [
      ['NEW', 0],
      ['CONTACTED', 55 * MIN],
    ],
    followUps: [at(9, 27)],
  },
  {
    id: 'D9',
    team: 'dach',
    owner: 'lea',
    source: 'GOOGLE_ADS',
    stage: 'NEGOTIATION',
    created: at(9, 16),
    contactMin: 45,
    budgetMax: 4_000_000,
    lastContact: NOW - 60 * HOUR,
    history: [
      ['NEW', 0],
      ['CONTACTED', 45 * MIN],
      ['QUALIFIED', 12 * HOUR + 45 * MIN],
      ['TEST_DRIVE', 36 * HOUR + 45 * MIN],
      ['NEGOTIATION', 84 * HOUR + 45 * MIN],
    ],
    followUps: [at(10, 1, 12)],
  },
  {
    id: 'D10',
    team: 'dach',
    owner: null,
    source: 'WEBSITE',
    stage: 'NEW',
    created: at(9, 30, 6),
    history: [['NEW', 0]],
  },
  // 22:30Z on Aug 31 is 00:30 on Sep 1 in Brussels → current period
  {
    id: 'B1',
    team: 'dach',
    owner: 'anna',
    source: 'WEBSITE',
    stage: 'NEW',
    created: at(8, 31, 22, 30),
  },
  // ---- Team DACH, previous period ----
  {
    id: 'B2',
    team: 'dach',
    owner: 'anna',
    source: 'WEBSITE',
    stage: 'NEW',
    created: at(8, 31, 21, 30),
  },
  {
    id: 'P1',
    team: 'dach',
    owner: 'anna',
    source: 'WEBSITE',
    stage: 'WON',
    created: at(8, 10),
    contactMin: 20,
    closed: at(8, 20),
    deal: 1_000_000,
    history: [
      ['NEW', 0],
      ['WON', 10 * HOUR],
    ],
  },
  {
    id: 'P2',
    team: 'dach',
    owner: 'jonas',
    source: 'WEBSITE',
    stage: 'LOST',
    created: at(8, 12),
    contactMin: 30,
    closed: at(8, 25),
    lost: 'PRICE',
    history: [
      ['NEW', 0],
      ['LOST', 10 * HOUR],
    ],
  },
  {
    id: 'P3',
    team: 'dach',
    owner: 'lea',
    source: 'WEBSITE',
    stage: 'CONTACTED',
    created: at(8, 15),
    contactMin: 40,
    history: [
      ['NEW', 0],
      ['CONTACTED', 40 * MIN],
    ],
  },
  {
    id: 'P4',
    team: 'dach',
    owner: 'anna',
    source: 'WEBSITE',
    stage: 'NEW',
    created: at(8, 20),
    history: [['NEW', 0]],
  },
  // ---- created before both periods, closed / cold inside them ----
  { id: 'D11', team: 'dach', owner: 'anna', source: 'WEBSITE', stage: 'COLD', created: at(7, 1) },
  {
    id: 'D12',
    team: 'dach',
    owner: 'jonas',
    source: 'WEBSITE',
    stage: 'LOST',
    created: at(7, 2),
    closed: at(9, 23),
    lost: 'NOT_READY',
  },
  {
    id: 'D13',
    team: 'dach',
    owner: 'jonas',
    source: 'WEBSITE',
    stage: 'LOST',
    created: at(7, 3),
    closed: at(9, 24),
    lost: 'NOT_READY',
  },
  // ---- other teams ----
  {
    id: 'W1',
    team: 'west',
    owner: 'emile',
    source: 'WEBSITE',
    stage: 'NEW',
    created: at(9, 5),
    history: [['NEW', 0]],
  },
  {
    id: 'S1',
    team: 'south',
    owner: 'sofia',
    source: 'REFERRAL',
    stage: 'WON',
    created: at(9, 6),
    contactMin: 15,
    closed: at(9, 9),
    deal: 2_000_000,
    history: [
      ['NEW', 0],
      ['CONTACTED', 15 * MIN],
      ['WON', 30 * HOUR],
    ],
  },
];

export type Fixture = {
  sqlite: Database.Database;
  db: Db;
  users: Record<string, CurrentUser>;
  ctx: (userId: string) => Promise<DashboardCtx>;
};

export function buildFixture(): Fixture {
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
  for (const u of ORG) {
    insertUser(sqlite, {
      id: u.id,
      name: u.id,
      role: u.role,
      managerId: u.manager,
      teamId: u.team,
    });
  }
  for (const [t, m] of [
    ['dach', 'lukas'],
    ['west', 'claire'],
    ['south', 'marco'],
  ]) {
    sqlite.prepare('UPDATE teams SET manager_id = ? WHERE id = ?').run(m, t);
  }
  sqlite.exec(
    `INSERT INTO customers (id, first_name, last_name, email, country, language, preferred_channel, created_at) VALUES ('c1', 'A', 'B', 'a@b.test', 'DE', 'de', 'EMAIL', 1)`,
  );

  const insLead = sqlite.prepare(
    `INSERT INTO leads (id, reference, customer_id, team_id, owner_id, source, stage, priority, budget_max, deal_value, lost_reason, first_response_at, last_contact_at, closed_at, score_breakdown, created_at, updated_at)
     VALUES (@id, @ref, 'c1', @team, @owner, @source, @stage, @priority, @budgetMax, @deal, @lost, @frt, @lastContact, @closed, '{}', @created, @created)`,
  );
  const insAct = sqlite.prepare(
    `INSERT INTO activities (id, lead_id, actor_id, kind, type, note, created_at) VALUES (?, ?, ?, 'USER', ?, '', ?)`,
  );
  const insHist = sqlite.prepare(
    `INSERT INTO stage_history (id, lead_id, from_stage, to_stage, changed_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const insFu = sqlite.prepare(
    `INSERT INTO follow_ups (id, lead_id, assigned_to, due_at, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', 1)`,
  );
  sqlite.transaction(() => {
    for (const l of LEADS) {
      insLead.run({
        id: l.id,
        ref: `REF-${l.id}`,
        team: l.team,
        owner: l.owner,
        source: l.source ?? 'WEBSITE',
        stage: l.stage ?? 'NEW',
        priority: l.priority ?? 'COOL',
        budgetMax: l.budgetMax ?? null,
        deal: l.deal ?? null,
        lost: l.lost ?? null,
        frt: l.contactMin !== undefined ? l.created + l.contactMin * MIN : null,
        lastContact: l.lastContact ?? null,
        closed: l.closed ?? null,
        created: l.created,
      });
      const actor = l.owner ?? 'lukas';
      if (l.contactMin !== undefined) {
        insAct.run(`a-${l.id}`, l.id, actor, 'CALL', l.created + l.contactMin * MIN);
      }
      if (l.noteOnly) insAct.run(`n-${l.id}`, l.id, actor, 'NOTE', l.created + 5 * MIN);
      (l.history ?? []).forEach(([stage, off], i) =>
        insHist.run(
          `h-${l.id}-${i}`,
          l.id,
          i === 0 ? null : l.history![i - 1]![0],
          stage,
          l.created + off,
        ),
      );
      (l.followUps ?? []).forEach((due, i) => insFu.run(`f-${l.id}-${i}`, l.id, actor, due));
    }
  })();

  const users: Record<string, CurrentUser> = {};
  for (const u of ORG) {
    users[u.id] = { id: u.id, name: u.id, email: `${u.id}@x.test`, role: u.role, teamId: u.team };
  }
  return {
    sqlite,
    db,
    users,
    ctx: async (id) => ({ user: users[id]!, scope: await resolveScope(id, db) }),
  };
}
