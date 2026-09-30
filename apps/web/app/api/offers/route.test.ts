import { beforeAll, describe, expect, it } from 'vitest';
import { EMAILS, loginAs, req, setupAuthEnv, validOffer } from '@/tests/integration/offers/helpers';

let route: typeof import('./route');
let cookies: Record<'REP' | 'MANAGER' | 'VP', string>;

const get = (qs: string, cookie: string) =>
  route.GET(req(`/api/offers${qs}`, { cookie }), { params: {} });
const post = (body: unknown, cookie: string) =>
  route.POST(req('/api/offers', { method: 'POST', body, cookie }), { params: {} });

beforeAll(async () => {
  await setupAuthEnv();
  route = await import('./route');
  cookies = {
    REP: await loginAs(EMAILS.REP),
    MANAGER: await loginAs(EMAILS.MANAGER),
    VP: await loginAs(EMAILS.VP),
  };
});

describe('GET /api/offers', () => {
  it('401 without a session', async () => {
    expect((await get('', '')).status).toBe(401);
  });

  it('active: 200 for every role and excludes the expired seeded offer', async () => {
    for (const role of ['REP', 'MANAGER', 'VP'] as const) {
      const res = await get('?status=active', cookies[role]);
      expect(res.status).toBe(200);
      const titles = (await res.json()).offers.map((o: { title: string }) => o.title);
      expect(titles).toContain('Loyalty Bonus');
      expect(titles).not.toContain('Summer Sale');
    }
  });

  it('defaults to active and visible is allowed for reps', async () => {
    expect((await get('', cookies.REP)).status).toBe(200);
    expect((await get('?status=visible', cookies.REP)).status).toBe(200);
  });

  it('all: 403 for REP and MANAGER, 200 for VP including expired offers', async () => {
    expect((await get('?status=all', cookies.REP)).status).toBe(403);
    expect((await get('?status=all', cookies.MANAGER)).status).toBe(403);
    const res = await get('?status=all', cookies.VP);
    expect(res.status).toBe(200);
    const offers = (await res.json()).offers as { title: string; status: string }[];
    expect(offers.find((o) => o.title === 'Summer Sale')?.status).toBe('EXPIRED');
  });

  it('400 for an unknown status', async () => {
    expect((await get('?status=nope', cookies.VP)).status).toBe(400);
  });
});

describe('POST /api/offers', () => {
  it('401 without a session', async () => {
    expect((await post(validOffer(), '')).status).toBe(401);
  });

  it('403 for REP and MANAGER', async () => {
    expect((await post(validOffer(), cookies.REP)).status).toBe(403);
    expect((await post(validOffer(), cookies.MANAGER)).status).toBe(403);
  });

  it('201 for VP; writes an audit row and publishes offer.changed', async () => {
    const { bus } = await import('@/server/events/bus');
    const { db } = await import('@/server/db/client');
    const { auditLog } = await import('@/server/db/schema');
    const events: { type: string; offerId?: string }[] = [];
    const off = bus.subscribe((e) => events.push(e));
    const res = await post(validOffer(), cookies.VP);
    off();
    expect(res.status).toBe(201);
    const { offer } = await res.json();
    expect(offer).toMatchObject({ title: 'Autumn Finance 0,9 %', status: 'ACTIVE' });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'offer.changed', offerId: offer.id }),
    );
    const audit = db
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.entityId === offer.id);
    expect(audit.map((a) => a.action)).toEqual(['offer.create']);
    const list = await (await get('?status=active', cookies.REP)).json();
    expect(list.offers.map((o: { id: string }) => o.id)).toContain(offer.id);
  });

  it('400 for invalid bodies', async () => {
    const bad = [
      validOffer({ title: 'ab' }),
      validOffer({ discountType: 'PERCENT', value: 101 }),
      validOffer({ value: null }),
      validOffer({ validTo: 1, validFrom: 2 }),
      validOffer({ eligibility: { models: [] } }),
      validOffer({ eligibility: { surprise: true } }),
    ];
    for (const body of bad) {
      const res = await post(body, cookies.VP);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    }
    const malformed = await route.POST(
      req('/api/offers', { method: 'POST', body: '{not json', cookie: cookies.VP }),
      { params: {} },
    );
    expect(malformed.status).toBe(400);
  });
});
