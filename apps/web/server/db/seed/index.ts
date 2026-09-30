import { count, eq, and, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { openDatabase, resolveDbPath } from '../client';
import { runMigrations } from '../migrate';
import * as schema from '../schema';
import { rng } from './utils/rng';
import { clock, DAY, setNow, MINUTE } from './utils/time';
import { resetReferences } from './utils/reference';
import { resetIds } from './utils/ids';
import { seedOrg } from './org';
import { seedOffers } from './offers';
import { seedCustomers, seedHeroCustomers, seedFaker } from './customers';
import { planBaseLeads } from './leads';
import { buildLead } from './activities';
import { planFollowUps, planHeroLeads, planScenarioLeads, rebalanceDach } from './scenarios';
import { scoreLeads } from './score-step';
import type { BuiltLead, CustomerRow, FollowUpRow, PurchaseRow } from './types';

export type SeedOptions = { seed?: number; now?: number; baseLeads?: number; silent?: boolean };

export type SeedSummary = {
  seed: number;
  tables: Record<string, number>;
  stages: Record<string, number>;
  teams: Record<string, number>;
  unassigned: number;
  slaBreaches: number;
  overdueFollowUps: number;
  ms: number;
};

function chunked<T>(rows: T[], size: number, insert: (chunk: T[]) => void): void {
  for (let i = 0; i < rows.length; i += size) insert(rows.slice(i, i + size));
}

/** Seeds an empty, migrated database. Deterministic for a given seed (FR-030). */
export function seedDatabase(db: Db, opts: SeedOptions = {}): SeedSummary {
  const started = Date.now();
  const seed = opts.seed ?? Number(process.env.SEED ?? '42');
  rng.reseed(seed);
  seedFaker(seed);
  setNow(opts.now ?? Date.now());
  resetReferences(new Date(clock.now).getUTCFullYear());
  resetIds(seed);

  const existing = db.select({ n: count() }).from(schema.users).get()?.n ?? 0;
  if (existing > 0) {
    throw new Error('Database is not empty (append-only tables cannot be cleared). Run npm run db:reset.');
  }

  const org = seedOrg();
  const { offers } = seedOffers(org.vpId);
  const base = seedCustomers(600);
  const hero = seedHeroCustomers();
  const customers: CustomerRow[] = [...base.customers, hero.giulia, hero.markus];
  const purchases: PurchaseRow[] = [...base.purchases, hero.purchase];

  const ctx = { org, customers: base.customers, rr: { rr: 0 } };
  const plans = planBaseLeads(opts.baseLeads ?? 750, base.customers, org);
  const { felixNeglected } = rebalanceDach(plans, org);
  const scenario = planScenarioLeads(ctx, felixNeglected);
  const heroLeads = planHeroLeads(org, hero.giulia, hero.markus);
  const allPlans = [...plans, ...scenario.plans, ...heroLeads.plans].sort((a, b) => a.createdAt - b.createdAt);
  const forceHot = new Set([...scenario.forceHot, ...heroLeads.forceHot]);

  // References are assigned in creation order because leads are built oldest-first.
  const built: BuiltLead[] = allPlans.map((p) => buildLead(p, offers));

  // Customers exist from their first lead (or purchase) onwards.
  const firstLead = new Map<string, number>();
  for (const b of built) {
    const cur = firstLead.get(b.lead.customerId as string);
    const t = b.lead.createdAt as number;
    if (cur === undefined || t < cur) firstLead.set(b.lead.customerId as string, t);
  }
  const purchaseAt = new Map<string, number>();
  for (const p of purchases) purchaseAt.set(p.customerId, Math.min(purchaseAt.get(p.customerId) ?? Infinity, p.purchasedAt));
  for (const c of customers) {
    const lead = firstLead.get(c.id);
    const bought = purchaseAt.get(c.id);
    c.createdAt = Math.min(lead !== undefined ? lead - 5 * MINUTE : clock.now - 5 * DAY, bought ?? Infinity);
  }

  const followUps: FollowUpRow[] = [...planFollowUps(built), ...built.flatMap((b) => (b.doneFollowUp ? [b.doneFollowUp] : []))];
  for (const b of built) if (b.purchase) purchases.push(b.purchase);

  db.transaction((tx) => {
    tx.insert(schema.teams).values(org.teams).run();
    tx.insert(schema.users).values(org.users).run();
    chunked(customers, 100, (c) => tx.insert(schema.customers).values(c).run());
    tx.insert(schema.offers).values(offers).run();
    chunked(built, 50, (c) => tx.insert(schema.leads).values(c.map((b) => b.lead)).run());
    chunked(built.flatMap((b) => b.activities), 500, (c) => tx.insert(schema.activities).values(c).run());
    chunked(built.flatMap((b) => b.history), 500, (c) => tx.insert(schema.stageHistory).values(c).run());
    chunked(followUps, 200, (c) => tx.insert(schema.followUps).values(c).run());
    chunked(purchases, 200, (c) => tx.insert(schema.purchases).values(c).run());
    scoreLeads(tx, undefined, forceHot);
  });

  return summarize(db, seed, Date.now() - started);
}

function summarize(db: Db, seed: number, ms: number): SeedSummary {
  const now = clock.now;
  const n = (q: { n: number } | undefined) => q?.n ?? 0;
  const tables: Record<string, number> = {};
  for (const [name, table] of Object.entries({
    users: schema.users,
    teams: schema.teams,
    customers: schema.customers,
    leads: schema.leads,
    activities: schema.activities,
    stage_history: schema.stageHistory,
    follow_ups: schema.followUps,
    offers: schema.offers,
    purchases: schema.purchases,
  })) {
    tables[name] = n(db.select({ n: count() }).from(table).get());
  }
  const stages: Record<string, number> = {};
  for (const r of db.select({ stage: schema.leads.stage, n: count() }).from(schema.leads).groupBy(schema.leads.stage).all()) {
    stages[r.stage] = r.n;
  }
  const teams: Record<string, number> = {};
  for (const r of db
    .select({ name: schema.teams.name, n: count() })
    .from(schema.leads)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.leads.teamId))
    .groupBy(schema.teams.name)
    .all()) {
    teams[r.name] = r.n;
  }
  const unassigned = n(db.select({ n: count() }).from(schema.leads).where(isNull(schema.leads.ownerId)).get());
  const slaBreaches = n(
    db
      .select({ n: count() })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.stage, 'NEW'),
          isNotNull(schema.leads.ownerId),
          isNull(schema.leads.firstResponseAt),
          lt(schema.leads.createdAt, now - 20 * MINUTE),
        ),
      )
      .get(),
  );
  const overdueFollowUps = n(
    db
      .select({ n: count() })
      .from(schema.followUps)
      .where(and(eq(schema.followUps.status, 'PENDING'), sql`${schema.followUps.dueAt} < ${now}`))
      .get(),
  );
  return { seed, tables, stages, teams, unassigned, slaBreaches, overdueFollowUps, ms };
}

export function printSummary(s: SeedSummary): void {
  console.log(`\nSeed complete (SEED=${s.seed}) in ${(s.ms / 1000).toFixed(1)} s`);
  console.log('\nRecords per table');
  console.table(s.tables);
  console.log('Leads per stage');
  console.table(s.stages);
  console.log('Leads per team');
  console.table(s.teams);
  console.log(
    `Unassigned: ${s.unassigned} | SLA breaches: ${s.slaBreaches} | Overdue follow-ups: ${s.overdueFollowUps}`,
  );
  if (s.ms > 10_000) console.warn('WARNING: seeding took longer than the 10 s budget.');
}

if (require.main === module) {
  const file = resolveDbPath();
  const { sqlite, db } = openDatabase(file);
  runMigrations(db);
  try {
    printSummary(seedDatabase(db));
  } finally {
    sqlite.close();
  }
}
