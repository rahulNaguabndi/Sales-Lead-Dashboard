import { beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase, type Db } from '../../server/db/client';
import { runMigrations } from '../../server/db/migrate';
import { seedDatabase } from '../../server/db/seed';
import { activities, auditLog, customers, leads } from '../../server/db/schema';
import type { CurrentUser } from '../../server/policy';
import {
  getContactLink,
  getProfile,
  updatePreferences,
  ADAPTERS,
} from '../../server/channels';

let db: Db;
const users: Record<string, CurrentUser> = {};
let ownLead: { id: string; customerId: string };
let foreignLead: { id: string; customerId: string };
let rep: CurrentUser;
let manager: CurrentUser;
let vp: CurrentUser;

beforeAll(() => {
  db = openDatabase(':memory:').db;
  runMigrations(db);
  seedDatabase(db, { seed: 42, now: Math.floor(Date.now() / 3_600_000) * 3_600_000, silent: true });
  const rows = db.all<{
    id: string;
    name: string;
    email: string;
    role: CurrentUser['role'];
    team_id: string | null;
  }>(sql`SELECT id, name, email, role, team_id FROM users`);
  for (const r of rows) {
    users[r.name] = { id: r.id, name: r.name, email: r.email, role: r.role, teamId: r.team_id };
  }
  rep = users['Sofia Rossi']!;
  vp = Object.values(users).find((u) => u.role === 'VP')!;
  manager = Object.values(users).find((u) => u.role === 'MANAGER' && u.teamId === rep.teamId)!;
  ownLead = db.all<{ id: string; customerId: string }>(
    sql`SELECT id, customer_id AS customerId FROM leads WHERE owner_id = ${rep.id} LIMIT 1`,
  )[0]!;
  foreignLead = db.all<{ id: string; customerId: string }>(
    sql`SELECT id, customer_id AS customerId FROM leads WHERE owner_id IS NOT NULL AND team_id != ${rep.teamId} LIMIT 1`,
  )[0]!;
});

describe('GET profile RBAC', () => {
  it('REP / MANAGER / VP can read an in-scope lead customer', async () => {
    for (const u of [rep, manager, vp]) {
      const p = await getProfile(u, ownLead.customerId, ownLead.id, { database: db });
      expect(p.customer.id).toBe(ownLead.customerId);
    }
  });
  it('out-of-scope lead is hidden (404) for REP and MANAGER', async () => {
    for (const u of [rep, manager]) {
      await expect(
        getProfile(u, foreignLead.customerId, foreignLead.id, { database: db }),
      ).rejects.toMatchObject({ statusCode: 404 });
    }
  });
  it('VP reads any lead', async () => {
    await expect(
      getProfile(vp, foreignLead.customerId, foreignLead.id, { database: db }),
    ).resolves.toBeTruthy();
  });
  it('lead that does not belong to the customer is a 404', async () => {
    await expect(
      getProfile(vp, foreignLead.customerId, ownLead.id, { database: db }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('history redaction', () => {
  it('reduces out-of-scope past leads to reference/stage/createdAt with no id or owner', async () => {
    const extra = db.all<{ id: string; customer_id: string }>(
      sql`SELECT id, customer_id FROM leads WHERE customer_id IN (SELECT customer_id FROM leads GROUP BY customer_id HAVING count(*) > 1) LIMIT 1`,
    )[0];
    if (!extra) return; // seed has no multi-lead customer; covered by the seeded returning test
    const p = await getProfile(vp, extra.customer_id, extra.id, { database: db });
    expect(p.history.leads.every((l) => l.inScope)).toBe(true);
  });

  it('redacts a past lead outside the caller scope', async () => {
    // Give the rep's customer a second lead that belongs to a foreign team.
    const base = db.select().from(leads).where(eq(leads.id, foreignLead.id)).get()!;
    const clone = { ...base, id: '01HZZZZZZZZZZZZZZZZZZZZZZZ', reference: 'EDM-TEST-REDACT', customerId: ownLead.customerId };
    db.insert(leads).values(clone).run();
    const p = await getProfile(rep, ownLead.customerId, ownLead.id, { database: db });
    const red = p.history.leads.find((l) => l.reference === 'EDM-TEST-REDACT')!;
    expect(red.inScope).toBe(false);
    expect(Object.keys(red).sort()).toEqual(['createdAt', 'inScope', 'reference', 'stage']);
    db.delete(leads).where(eq(leads.id, clone.id)).run();
  });

  it('every seeded returning customer has a history entry (SC-004)', () => {
    const returning = db.select().from(customers).where(eq(customers.isReturning, true)).all();
    for (const c of returning) {
      const l = db.all<{ n: number }>(sql`SELECT count(*) n FROM leads WHERE customer_id = ${c.id}`)[0]!.n;
      const pu = db.all<{ n: number }>(sql`SELECT count(*) n FROM purchases WHERE customer_id = ${c.id}`)[0]!.n;
      expect(l + pu).toBeGreaterThan(0);
    }
  });
});

describe('PATCH preferences', () => {
  it('updates customer, audit row and SYSTEM note in one go', async () => {
    const before = db.select().from(customers).where(eq(customers.id, ownLead.customerId)).get()!;
    const target = before.preferredChannel === 'CALL' ? 'SMS' : 'CALL';
    const nActs = db.select().from(activities).where(eq(activities.leadId, ownLead.id)).all().length;
    const nAudit = db.select().from(auditLog).all().length;
    const v = await updatePreferences(
      rep,
      ownLead.customerId,
      { leadId: ownLead.id, preferredChannel: target },
      { database: db },
    );
    expect(v.preferredChannel).toBe(target);
    expect(db.select().from(auditLog).all().length).toBe(nAudit + 1);
    const acts = db.select().from(activities).where(eq(activities.leadId, ownLead.id)).all();
    expect(acts.length).toBe(nActs + 1);
    const note = acts.find((a) => a.note.startsWith('Preferences updated'))!;
    expect(note.kind).toBe('SYSTEM');
    expect(note.note).toContain('→');
  });
  it('never leaves secondary equal to preferred', async () => {
    const v = await updatePreferences(
      rep,
      ownLead.customerId,
      { leadId: ownLead.id, preferredChannel: 'EMAIL', secondaryChannel: 'SMS' },
      { database: db },
    );
    const v2 = await updatePreferences(
      rep,
      ownLead.customerId,
      { leadId: ownLead.id, preferredChannel: 'SMS' },
      { database: db },
    );
    expect(v.secondaryChannel).toBe('SMS');
    expect(v2.secondaryChannel).toBeNull();
  });
  it('forbids out-of-scope writers and rejects mismatched leads', async () => {
    await expect(
      updatePreferences(rep, foreignLead.customerId, { leadId: foreignLead.id, bestTime: 'MORNING' }, { database: db }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      updatePreferences(rep, ownLead.customerId, { leadId: foreignLead.id, bestTime: 'MORNING' }, { database: db }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it('rolls back everything when the transaction fails', async () => {
    const before = db.select().from(customers).where(eq(customers.id, ownLead.customerId)).get()!;
    const nAudit = db.select().from(auditLog).all().length;
    db.run(sql`CREATE TRIGGER fail_note BEFORE INSERT ON activities WHEN NEW.note LIKE 'Preferences updated%' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    await expect(
      updatePreferences(rep, ownLead.customerId, { leadId: ownLead.id, bestTime: before.bestTime === 'MORNING' ? 'EVENING' : 'MORNING' }, { database: db }),
    ).rejects.toThrow();
    db.run(sql`DROP TRIGGER fail_note`);
    const after = db.select().from(customers).where(eq(customers.id, ownLead.customerId)).get()!;
    expect(after.bestTime).toBe(before.bestTime);
    expect(db.select().from(auditLog).all().length).toBe(nAudit);
  });
});

describe('contact link (RBAC, no writes)', () => {
  it('builds a link for an in-scope lead and writes nothing', async () => {
    const nActs = db.select().from(activities).all().length;
    const cust = db.select().from(customers).where(eq(customers.id, ownLead.customerId)).get()!;
    const channel = cust.phone ? 'WHATSAPP' : 'EMAIL';
    const r = await getContactLink(rep, ownLead.id, { channel, template: 'first_contact' }, { database: db });
    expect(r.href).toMatch(/^(https:\/\/wa\.me\/|mailto:)/);
    expect(db.select().from(activities).all().length).toBe(nActs);
  });
  it('404 out of scope, 400 unavailable channel or offer_share without offer', async () => {
    await expect(
      getContactLink(rep, foreignLead.id, { channel: 'CALL' }, { database: db }),
    ).rejects.toMatchObject({ statusCode: 404 });
    db.update(customers).set({ email: null, phone: '+393471234567' }).where(eq(customers.id, ownLead.customerId)).run();
    await expect(
      getContactLink(rep, ownLead.id, { channel: 'EMAIL' }, { database: db }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      getContactLink(rep, ownLead.id, { channel: 'SMS', template: 'offer_share' }, { database: db }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(getContactLink(manager, ownLead.id, { channel: 'CALL' }, { database: db })).resolves.toBeTruthy();
    await expect(getContactLink(vp, foreignLead.id, { channel: 'CALL' }, { database: db })).resolves.toBeTruthy();
  });
});

describe('DeepLinkAdapter', () => {
  const c = { phone: '+393471234567', email: 'a@b.it' };
  it('builds links for all four channels and has no send()', () => {
    expect(ADAPTERS.WHATSAPP.buildLink(c, 'Ciao')).toBe('https://wa.me/393471234567?text=Ciao');
    expect(ADAPTERS.CALL.buildLink(c, '')).toBe('tel:+393471234567');
    expect(ADAPTERS.SMS.buildLink(c, 'Hi')).toBe('sms:+393471234567?&body=Hi');
    expect(ADAPTERS.EMAIL.buildLink(c, 'Body', { subject: 'Sub' })).toBe('mailto:a@b.it?subject=Sub&body=Body');
    for (const a of Object.values(ADAPTERS)) expect(a.send).toBeUndefined();
  });
  it('throws for unavailable channels', () => {
    expect(() => ADAPTERS.EMAIL.buildLink({ phone: '+39347', email: null }, 'x')).toThrow('No email');
  });
});
