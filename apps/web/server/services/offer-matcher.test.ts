import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { openDatabase, type Db } from '../db/client';
import { runMigrations } from '../db/migrate';
import { seedDatabase } from '../db/seed';
import { auditLog, customers, leads, offers, teams, users } from '../db/schema';
import {
  buildOfferAppliedActivity,
  createOffer,
  deleteOffer,
  getOffersForLead,
  listActiveOffers,
  listOffers,
  OfferInUseError,
  OfferNotApplicableError,
  toHttpError,
  toggleOffer,
  updateOffer,
  validateAppliedOffer,
} from './offer-matcher';

const DAY = 86_400_000;
let db: Db;
let now: number;
let vpId: string;
let teamId: string;
let lead1: string; // returning DE lead with trade-in
let lead2: string; // new AT lead wanting finance
const publish = vi.fn(async () => undefined);
const deps = () => ({ database: db, now, publish });

function insertLead(
  c: Partial<typeof customers.$inferInsert>,
  l: Partial<typeof leads.$inferInsert>,
): string {
  const customerId = ulid();
  db.insert(customers)
    .values({
      id: customerId,
      firstName: 'T',
      lastName: 'Lead',
      email: `${customerId}@example.com`,
      country: 'DE',
      language: 'de',
      preferredChannel: 'EMAIL',
      createdAt: now,
      ...c,
    })
    .run();
  const id = ulid();
  db.insert(leads)
    .values({
      id,
      reference: `T-${id.slice(-8)}`,
      customerId,
      teamId,
      source: 'WEBSITE',
      scoreBreakdown: { intent: 0, source: 0, customer: 0, freshness: 0, engagement: 0 },
      createdAt: now,
      updatedAt: now,
      ...l,
    })
    .run();
  return id;
}

beforeAll(() => {
  db = openDatabase(':memory:').db;
  runMigrations(db);
  now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  seedDatabase(db, { seed: 42, now, silent: true, baseLeads: 10 });
  vpId = db.select().from(users).where(eq(users.role, 'VP')).get()!.id;
  teamId = db.select().from(teams).get()!.id;
  lead1 = insertLead(
    { isReturning: true, country: 'DE' },
    { vehicleModel: 'aurora-suv', hasTradeIn: true, budgetMax: 4_500_000 },
  );
  lead2 = insertLead(
    { isReturning: false, country: 'AT' },
    { vehicleModel: 'luma-ev', wantsFinance: true },
  );
});

const input = (over: Record<string, unknown> = {}) => ({
  title: 'Winter Trade-in Bonus',
  description: 'Extra for trade-ins',
  discountType: 'AMOUNT' as const,
  value: 150_000,
  validFrom: now - DAY,
  validTo: now + 30 * DAY,
  eligibility: { requiresTradeIn: true },
  isActive: true,
  ...over,
});

describe('listActiveOffers', () => {
  it('excludes the seeded expired offer and includes active ones', async () => {
    const titles = (await listActiveOffers(deps())).map((o) => o.title);
    expect(titles).toContain('Loyalty Bonus');
    expect(titles).not.toContain('Summer Sale');
  });
});

describe('offer CRUD', () => {
  it('creates with audit, event and appears in active list; toggle and update audit', async () => {
    publish.mockClear();
    const created = await createOffer(input(), vpId, deps());
    expect(created.status).toBe('ACTIVE');
    expect(created.appliedCount).toBe(0);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'offer.changed', offerId: created.id, by: vpId }),
    );
    expect((await listActiveOffers(deps())).map((o) => o.id)).toContain(created.id);

    const off = await toggleOffer(created.id, false, vpId, deps());
    expect(off.status).toBe('INACTIVE');
    expect((await listActiveOffers(deps())).map((o) => o.id)).not.toContain(created.id);
    const upd = await updateOffer(created.id, { title: 'Winter Trade-in Plus' }, vpId, deps());
    expect(upd.title).toBe('Winter Trade-in Plus');

    const actions = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id))
      .all()
      .map((a) => a.action);
    expect(actions).toEqual(['offer.create', 'offer.toggle', 'offer.update']);

    await deleteOffer(created.id, vpId, deps());
    expect(db.select().from(offers).where(eq(offers.id, created.id)).get()).toBeUndefined();
    expect(
      db.select().from(auditLog).where(eq(auditLog.action, 'offer.delete')).all().length,
    ).toBeGreaterThan(0);
  });

  it('rejects invalid merged updates and unknown ids', async () => {
    const o = await createOffer(input({ title: 'Merge Check' }), vpId, deps());
    await expect(
      updateOffer(o.id, { validTo: o.validFrom - 1 }, vpId, deps()),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      updateOffer('missing', { title: 'Nope nope' }, vpId, deps()),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(deleteOffer('missing', vpId, deps())).rejects.toMatchObject({ statusCode: 404 });
    await deleteOffer(o.id, vpId, deps());
  });

  it('listOffers filters by status', async () => {
    const future = await createOffer(
      input({ title: 'Future one', validFrom: now + 5 * DAY, validTo: now + 9 * DAY }),
      vpId,
      deps(),
    );
    const active = (await listOffers('active', deps())).map((o) => o.title);
    const visible = (await listOffers('visible', deps())).map((o) => o.title);
    const all = (await listOffers('all', deps())).map((o) => o.title);
    expect(active).not.toContain('Future one');
    expect(visible).toContain('Future one');
    expect(visible).not.toContain('Summer Sale');
    expect(all).toContain('Summer Sale');
    await deleteOffer(future.id, vpId, deps());
  });
});

describe('getOffersForLead', () => {
  it('returns Loyalty and Trade-in offers for a returning DE lead with trade-in, not expired ones', async () => {
    const res = await getOffersForLead(lead1, deps());
    const titles = res.map((r) => r.offer.title);
    expect(titles).toContain('Loyalty Bonus');
    expect(titles).toContain('Trade-in Boost');
    expect(titles).not.toContain('Summer Sale');
    expect(titles).not.toContain('0% APR Finance');
    const loyalty = res.find((r) => r.offer.title === 'Loyalty Bonus')!;
    expect(loyalty.reasons).toEqual(['Returning customer']);
  });

  it('matches finance and country rules for another lead', async () => {
    const titles = (await getOffersForLead(lead2, deps())).map((r) => r.offer.title);
    expect(titles).toContain('0% APR Finance');
    expect(titles).not.toContain('Loyalty Bonus');
    expect(titles).not.toContain('EV Switch Grant'); // AT not in DE/NL/FR
  });

  it('throws 404 for an unknown lead', async () => {
    await expect(getOffersForLead('nope', deps())).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('validateAppliedOffer (WON re-validation)', () => {
  const idOf = (title: string) => db.select().from(offers).where(eq(offers.title, title)).get()!.id;

  it('returns the offer when eligible and active', async () => {
    const o = await validateAppliedOffer(lead1, idOf('Loyalty Bonus'), deps());
    expect(o.title).toBe('Loyalty Bonus');
  });

  it('throws OfferNotApplicableError for expired offers', async () => {
    await expect(validateAppliedOffer(lead1, idOf('Summer Sale'), deps())).rejects.toBeInstanceOf(
      OfferNotApplicableError,
    );
  });

  it('throws when the offer expired between dialog open and submit', async () => {
    const o = await createOffer(input({ title: 'Short lived', eligibility: {} }), vpId, deps());
    await expect(validateAppliedOffer(lead1, o.id, deps())).resolves.toBeTruthy();
    await expect(
      validateAppliedOffer(lead1, o.id, { ...deps(), now: o.validTo + 1 }),
    ).rejects.toBeInstanceOf(OfferNotApplicableError);
    await deleteOffer(o.id, vpId, deps());
  });

  it('throws when deactivated', async () => {
    const o = await createOffer(input({ title: 'Toggle me', eligibility: {} }), vpId, deps());
    await toggleOffer(o.id, false, vpId, deps());
    await expect(validateAppliedOffer(lead1, o.id, deps())).rejects.toBeInstanceOf(
      OfferNotApplicableError,
    );
    await deleteOffer(o.id, vpId, deps());
  });

  it('throws when the lead is ineligible or unknown, and for unknown offers', async () => {
    await expect(validateAppliedOffer(lead2, idOf('Loyalty Bonus'), deps())).rejects.toBeInstanceOf(
      OfferNotApplicableError,
    );
    // ineligible after the lead changed
    db.update(leads).set({ hasTradeIn: false }).where(eq(leads.id, lead1)).run();
    await expect(
      validateAppliedOffer(lead1, idOf('Trade-in Boost'), deps()),
    ).rejects.toBeInstanceOf(OfferNotApplicableError);
    db.update(leads).set({ hasTradeIn: true }).where(eq(leads.id, lead1)).run();
    await expect(
      validateAppliedOffer('nope', idOf('Loyalty Bonus'), deps()),
    ).rejects.toBeInstanceOf(OfferNotApplicableError);
    await expect(validateAppliedOffer(lead1, 'nope', deps())).rejects.toBeInstanceOf(
      OfferNotApplicableError,
    );
  });

  it('maps to 422 OFFER_NOT_APPLICABLE and OFFER_IN_USE 409 via toHttpError', () => {
    const a = toHttpError(new OfferNotApplicableError());
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe('OFFER_NOT_APPLICABLE');
    const b = toHttpError(new OfferInUseError());
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe('OFFER_IN_USE');
  });
});

describe('buildOfferAppliedActivity', () => {
  it('produces the OFFER_APPLIED system activity text', () => {
    const a = buildOfferAppliedActivity({
      id: 'o1',
      title: 'Winter Trade-in Bonus',
      description: '',
      discountType: 'AMOUNT',
      value: 150_000,
    });
    expect(a.type).toBe('OFFER_APPLIED');
    expect(a.kind).toBe('SYSTEM');
    expect(a.note).toMatch(/^Applied: Winter Trade-in Bonus \(1\.500\s€\)$/);
    expect(a.metadata).toEqual({ offerId: 'o1' });
  });
});

describe('applied stats and delete guard', () => {
  it('counts only WON leads for appliedCount and wonRevenue; delete blocked when applied', async () => {
    const o = await createOffer(input({ title: 'Stats offer', eligibility: {} }), vpId, deps());
    const won = insertLead({}, { stage: 'WON', dealValue: 3_000_000, appliedOfferId: o.id });
    const won2 = insertLead({}, { stage: 'WON', dealValue: 2_000_000, appliedOfferId: o.id });
    insertLead({}, { stage: 'NEGOTIATION', dealValue: 9_000_000, appliedOfferId: o.id });
    expect(won && won2).toBeTruthy();
    const row = (await listOffers('all', deps())).find((x) => x.id === o.id)!;
    expect(row.appliedCount).toBe(2);
    expect(row.wonRevenue).toBe(5_000_000);
    await expect(deleteOffer(o.id, vpId, deps())).rejects.toBeInstanceOf(OfferInUseError);
    expect(db.select().from(offers).where(eq(offers.id, o.id)).get()).toBeDefined();
    const untouched = (await listOffers('all', deps())).find((x) => x.title === 'Loyalty Bonus')!;
    expect(untouched.appliedCount).toBe(0);
    expect(untouched.wonRevenue).toBe(0);
  });
});
