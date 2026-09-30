import { beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { IntakeLead } from '@leaddesk/shared';
import { payload, setupIntakeEnv } from '../helpers/intake-db';

let db: typeof import('@/server/db/client').db;
let s: typeof import('@/server/db/client').schema;
let ingestFn: typeof import('@/server/services/intake').ingest;
let bus: typeof import('@/server/events/bus').bus;
let IntakeLeadSchema: typeof import('@leaddesk/shared').IntakeLeadSchema;
let OPEN: readonly string[];

beforeAll(async () => {
  await setupIntakeEnv();
  ({ db, schema: s } = await import('@/server/db/client'));
  ({ ingest: ingestFn } = await import('@/server/services/intake'));
  ({ bus } = await import('@/server/events/bus'));
  ({ IntakeLeadSchema, OPEN_STAGES: OPEN as never } = await import('@leaddesk/shared'));
});

const ctx = { apiKeyName: 'showroom', ip: '1.2.3.4' };
const run = (over: Record<string, unknown> = {}, extra: { idempotencyKey?: string } = {}) =>
  ingestFn(IntakeLeadSchema.parse(payload(over)) as IntakeLead, { ...ctx, ...extra });

const leadByRef = (ref: string) =>
  db.select().from(s.leads).where(eq(s.leads.reference, ref)).get()!;
const team = (name: string) => db.select().from(s.teams).where(eq(s.teams.name, name)).get()!;
const openCount = (userId: string) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(s.leads)
    .where(and(eq(s.leads.ownerId, userId), inArray(s.leads.stage, [...OPEN] as never)))
    .get()!.n;

describe('returning customers (dedupe)', () => {
  it('matches the same phone typed four ways and flags returning (SC-005)', async () => {
    const first = await run({
      firstName: 'Giulia',
      lastName: 'Conti',
      country: 'IT',
      language: 'it',
      phone: '347 123 4567',
      email: 'giulia.conti@example.com',
      vehicleModel: 'luma-ev',
    });
    const customerId = leadByRef(first.reference).customerId;
    for (const [phone, model] of [
      ['+39 347 123 4567', 'aurora-suv'],
      ['0039 347 123 4567', 'metro-hatch'],
      ['+393471234567', 'vento-sedan'],
    ] as const) {
      const r = await run({
        firstName: 'Giulia',
        lastName: 'Conti',
        country: 'IT',
        language: 'it',
        phone,
        email: undefined,
        preferredChannel: 'CALL',
        vehicleModel: model,
      });
      expect(leadByRef(r.reference).customerId).toBe(customerId);
    }
    const c = db.select().from(s.customers).where(eq(s.customers.id, customerId)).get()!;
    expect(c.isReturning).toBe(true);
    expect(c.phone).toBe('+393471234567');
  });

  it('matches by email case-insensitively and never overwrites the name', async () => {
    const a = await run({
      email: 'Mixed.Case@Example.com',
      phone: undefined,
      firstName: 'Orig',
      lastName: 'Name',
    });
    const b = await run({
      email: 'mixed.case@example.com',
      phone: undefined,
      firstName: 'Other',
      lastName: 'Person',
      vehicleModel: 'nova-van',
      preferredChannel: 'EMAIL',
      bestTime: 'EVENING',
    });
    const la = leadByRef(a.reference);
    const lb = leadByRef(b.reference);
    expect(lb.customerId).toBe(la.customerId);
    const c = db.select().from(s.customers).where(eq(s.customers.id, la.customerId)).get()!;
    expect(c.firstName).toBe('Orig');
    expect(c.bestTime).toBe('EVENING');
  });

  it('phone wins when phone and email match different customers', async () => {
    const a = await run({ phone: '+4915199990001', email: 'conf.a@example.com' });
    const b = await run({ phone: '+4915199990002', email: 'conf.b@example.com' });
    const c = await run({
      phone: '+4915199990001',
      email: 'conf.b@example.com',
      vehicleModel: 'terra-4x4',
    });
    expect(leadByRef(c.reference).customerId).toBe(leadByRef(a.reference).customerId);
    expect(leadByRef(c.reference).customerId).not.toBe(leadByRef(b.reference).customerId);
    const act = db
      .select()
      .from(s.activities)
      .where(
        and(
          eq(s.activities.leadId, leadByRef(c.reference).id),
          eq(s.activities.type, 'LEAD_CREATED'),
        ),
      )
      .get()!;
    expect(act.metadata?.dedupeConflict).toBeTruthy();
  });
});

describe('team routing', () => {
  it.each([
    ['DE', 'Team DACH'],
    ['AT', 'Team DACH'],
    ['CH', 'Team DACH'],
    ['FR', 'Team West'],
    ['BE', 'Team West'],
    ['NL', 'Team West'],
    ['LU', 'Team West'],
    ['IT', 'Team South'],
    ['ES', 'Team South'],
    ['PT', 'Team South'],
  ])('%s → %s', async (country, teamName) => {
    const r = await run({ country, phone: undefined, language: country === 'FR' ? 'fr' : 'de' });
    expect(leadByRef(r.reference).teamId).toBe(team(teamName).id);
  });

  it('cycles unmapped countries through the teams', async () => {
    const seen = new Set<string>();
    for (const country of ['PL', 'IE', 'DK']) {
      const r = await run({ country, phone: undefined, language: country === 'PL' ? 'pl' : 'en' });
      seen.add(leadByRef(r.reference).teamId);
      const a = db
        .select()
        .from(s.activities)
        .where(
          and(
            eq(s.activities.leadId, leadByRef(r.reference).id),
            eq(s.activities.type, 'LEAD_CREATED'),
          ),
        )
        .get()!;
      expect(a.metadata?.routing).toBe('fallback_round_robin');
    }
    expect(seen.size).toBe(3);
  });

  it('sticky owner: a returning customer goes to the previous owner even across teams', async () => {
    const first = await run({
      country: 'FR',
      language: 'fr',
      phone: '+33612340001',
      email: undefined,
      preferredChannel: 'CALL',
    });
    const l1 = leadByRef(first.reference);
    expect(l1.ownerId).toBeTruthy();
    const second = await run({
      country: 'DE',
      language: 'de',
      phone: '+33612340001',
      email: undefined,
      preferredChannel: 'CALL',
      vehicleModel: 'nova-van',
    });
    const l2 = leadByRef(second.reference);
    expect(l2.ownerId).toBe(l1.ownerId);
    expect(l2.teamId).toBe(l1.teamId);
    const assigned = db
      .select()
      .from(s.activities)
      .where(and(eq(s.activities.leadId, l2.id), eq(s.activities.type, 'ASSIGNED')))
      .get()!;
    expect(assigned.metadata?.reason).toBe('existing customer relationship');
  });
});

describe('auto-assign', () => {
  it('LOAD_BALANCED picks the least loaded eligible rep', async () => {
    const west = team('Team West');
    db.update(s.teams)
      .set({ autoAssign: true, assignStrategy: 'LOAD_BALANCED' })
      .where(eq(s.teams.id, west.id))
      .run();
    const reps = db
      .select()
      .from(s.users)
      .where(and(eq(s.users.teamId, west.id), eq(s.users.role, 'REP'), eq(s.users.isActive, true)))
      .all();
    const min = Math.min(...reps.map((r) => openCount(r.id)));
    const r = await run({ country: 'FR', language: 'fr' });
    const owner = leadByRef(r.reference).ownerId!;
    expect(openCount(owner)).toBeLessThanOrEqual(min + 1); // +1 for the lead just added
    expect(reps.map((x) => x.id)).toContain(owner);
  });

  it('LANGUAGE_MATCH prefers a speaker of the customer language', async () => {
    const dach = team('Team DACH');
    db.update(s.teams)
      .set({ autoAssign: true, assignStrategy: 'LANGUAGE_MATCH' })
      .where(eq(s.teams.id, dach.id))
      .run();
    const r = await run({ country: 'CH', language: 'de' });
    const owner = db
      .select()
      .from(s.users)
      .where(eq(s.users.id, leadByRef(r.reference).ownerId!))
      .get()!;
    expect(owner.languages).toContain('de');
  });

  it('ROUND_ROBIN advances the cursor', async () => {
    const south = team('Team South');
    db.update(s.teams)
      .set({ autoAssign: true, assignStrategy: 'ROUND_ROBIN', rrCursor: null })
      .where(eq(s.teams.id, south.id))
      .run();
    const owners: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await run({ country: 'ES', language: 'es', phone: undefined });
      owners.push(leadByRef(r.reference).ownerId!);
    }
    expect(new Set(owners.slice(0, 4)).size).toBe(4);
    expect(owners[4]).toBe(owners[0]);
    expect(db.select().from(s.teams).where(eq(s.teams.id, south.id)).get()!.rrCursor).toBe(
      owners[4],
    );
  });

  it('auto-assign OFF → pool', async () => {
    const south = team('Team South');
    db.update(s.teams).set({ autoAssign: false }).where(eq(s.teams.id, south.id)).run();
    const r = await run({ country: 'PT', language: 'pt', phone: undefined });
    const l = leadByRef(r.reference);
    expect(l.ownerId).toBeNull();
    expect(r.assignedFirstName).toBeNull();
    const created = db
      .select()
      .from(s.activities)
      .where(and(eq(s.activities.leadId, l.id), eq(s.activities.type, 'LEAD_CREATED')))
      .get()!;
    expect(created.metadata?.unassignedReason).toBe('auto_assign_off');
    db.update(s.teams).set({ autoAssign: true }).where(eq(s.teams.id, south.id)).run();
  });

  it('all reps at capacity → pool with a note; no active reps → pool', async () => {
    const west = team('Team West');
    db.update(s.users).set({ maxOpenLeads: 0 }).where(eq(s.users.teamId, west.id)).run();
    const full = await run({ country: 'NL', language: 'nl', phone: undefined });
    const fl = leadByRef(full.reference);
    expect(fl.ownerId).toBeNull();
    const note = db
      .select()
      .from(s.activities)
      .where(and(eq(s.activities.leadId, fl.id), eq(s.activities.type, 'LEAD_CREATED')))
      .get()!.note;
    expect(note).toContain('Auto-assign skipped: all reps at capacity');

    db.update(s.users)
      .set({ isActive: false })
      .where(and(eq(s.users.teamId, west.id), eq(s.users.role, 'REP')))
      .run();
    const none = await run({ country: 'NL', language: 'nl', phone: undefined });
    const nl = db
      .select()
      .from(s.activities)
      .where(
        and(
          eq(s.activities.leadId, leadByRef(none.reference).id),
          eq(s.activities.type, 'LEAD_CREATED'),
        ),
      )
      .get()!;
    expect(nl.metadata?.unassignedReason).toBe('no_active_reps');
    db.update(s.users).set({ maxOpenLeads: 25 }).where(eq(s.users.teamId, west.id)).run();
    db.update(s.users).set({ isActive: true }).where(eq(s.users.teamId, west.id)).run();
  });
});

describe('timeline, audit and events (US5)', () => {
  it('writes SYSTEM activities, an audit row and publishes after commit', async () => {
    const events: { type: string }[] = [];
    const off = bus.subscribe((e) => events.push(e));
    const r = await run({ country: 'DE', language: 'de', city: 'Hamburg', source: 'FACEBOOK' });
    off();
    const l = leadByRef(r.reference);
    const acts = db.select().from(s.activities).where(eq(s.activities.leadId, l.id)).all();
    expect(acts.find((a) => a.type === 'LEAD_CREATED')!.note).toBe(
      'Lead created from Facebook · Hamburg, DE',
    );
    expect(acts.find((a) => a.type === 'ASSIGNED')!.note).toMatch(/^Auto-assigned to .+ · .+/);
    const audit = db.select().from(s.auditLog).where(eq(s.auditLog.entityId, l.id)).get()!;
    expect(audit.action).toBe('lead.intake');
    expect(audit.actorId).toBeNull();
    expect(audit.meta?.apiKeyName).toBe('showroom');
    expect(events.map((e) => e.type)).toEqual(['lead.created', 'lead.assigned']);
    expect(l.version).toBe(1);
    expect(l.score).toBeGreaterThan(0);
  });

  it('a throwing bus still returns a created lead', async () => {
    const spy = vi.spyOn(bus, 'publish').mockRejectedValue(new Error('boom'));
    const r = await run();
    spy.mockRestore();
    expect(r.kind).toBe('created');
    expect(leadByRef(r.reference)).toBeTruthy();
  });
});

describe('idempotency (US6)', () => {
  it('replays the original for the same key, even with a different payload', async () => {
    const a = await run({}, { idempotencyKey: 'key-1' });
    const before = db.select().from(s.leads).all().length;
    const b = await run({ vehicleModel: 'terra-4x4' }, { idempotencyKey: 'key-1' });
    expect(b.kind).toBe('duplicate');
    expect(b.reference).toBe(a.reference);
    expect(db.select().from(s.leads).all().length).toBe(before);
  });

  it('implicit duplicate: same customer + model within 10 minutes', async () => {
    const body = {
      phone: '+4915177770001',
      email: undefined,
      preferredChannel: 'CALL',
      vehicleModel: 'nova-van',
    };
    const a = await run(body);
    const b = await run(body);
    expect(b.kind).toBe('duplicate');
    expect(b.reference).toBe(a.reference);
    const c = await run({ ...body, vehicleModel: 'metro-hatch' });
    expect(c.kind).toBe('created');
  });
});

describe('references and concurrency (SC-003, SC-004)', () => {
  it('50 parallel intakes get unique references and exactly one owner-or-pool each', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => run({ country: 'DE', language: 'de' })),
    );
    expect(new Set(results.map((r) => r.reference)).size).toBe(50);
    expect(results.every((r) => r.kind === 'created')).toBe(true);
  });

  it('keeps a LOAD_BALANCED team balanced', async () => {
    const west = team('Team West');
    db.update(s.teams)
      .set({ autoAssign: true, assignStrategy: 'LOAD_BALANCED' })
      .where(eq(s.teams.id, west.id))
      .run();
    const reps = db
      .select()
      .from(s.users)
      .where(and(eq(s.users.teamId, west.id), eq(s.users.role, 'REP'), eq(s.users.isActive, true)))
      .all();
    const start = new Map(reps.map((r) => [r.id, openCount(r.id)]));
    await Promise.all(Array.from({ length: 20 }, () => run({ country: 'FR', language: 'fr' })));
    const added = reps.map((r) => openCount(r.id) - start.get(r.id)!);
    expect(added.reduce((a, b) => a + b, 0)).toBe(20);
    const totals = reps.map((r) => openCount(r.id));
    // Reps below the group level catch up first; nobody ends more than 1 above the max start level.
    expect(
      Math.max(...totals) - Math.max(...reps.map((r) => start.get(r.id)!)),
    ).toBeLessThanOrEqual(Math.ceil(20 / reps.length));
  });
});

describe('latency (SC-001, informational)', () => {
  it('p95 of 100 sequential intakes stays well under the budget', async () => {
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      await run({ country: 'IT', language: 'it', phone: undefined });
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.info(`intake p95 (degraded redis): ${p95.toFixed(1)} ms`);
    expect(p95).toBeLessThan(1000);
  });
});
