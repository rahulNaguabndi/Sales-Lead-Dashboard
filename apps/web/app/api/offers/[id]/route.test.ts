import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { EMAILS, loginAs, req, setupAuthEnv, validOffer } from '@/tests/integration/offers/helpers';

let root: typeof import('../route');
let item: typeof import('./route');
let cookies: Record<'REP' | 'MANAGER' | 'VP', string>;

const patch = (id: string, body: unknown, cookie: string) =>
  item.PATCH(req(`/api/offers/${id}`, { method: 'PATCH', body, cookie }), { params: { id } });
const remove = (id: string, cookie: string) =>
  item.DELETE(req(`/api/offers/${id}`, { method: 'DELETE', cookie }), { params: { id } });

async function create(title: string): Promise<string> {
  const res = await root.POST(
    req('/api/offers', { method: 'POST', body: validOffer({ title }), cookie: cookies.VP }),
    { params: {} },
  );
  return (await res.json()).offer.id;
}

beforeAll(async () => {
  await setupAuthEnv();
  root = await import('../route');
  item = await import('./route');
  cookies = {
    REP: await loginAs(EMAILS.REP),
    MANAGER: await loginAs(EMAILS.MANAGER),
    VP: await loginAs(EMAILS.VP),
  };
});

describe('PATCH /api/offers/:id', () => {
  it('401 unauthenticated, 403 for REP and MANAGER', async () => {
    const id = await create('Patch target');
    expect((await patch(id, { isActive: false }, '')).status).toBe(401);
    expect((await patch(id, { isActive: false }, cookies.REP)).status).toBe(403);
    expect((await patch(id, { isActive: false }, cookies.MANAGER)).status).toBe(403);
  });

  it('200 for VP: toggle and edit write audit rows and publish offer.changed', async () => {
    const { bus } = await import('@/server/events/bus');
    const { db } = await import('@/server/db/client');
    const { auditLog } = await import('@/server/db/schema');
    const id = await create('Patch me');
    const events: { type: string }[] = [];
    const off = bus.subscribe((e) => events.push(e));
    const toggled = await patch(id, { isActive: false }, cookies.VP);
    const edited = await patch(id, { title: 'Patched title' }, cookies.VP);
    off();
    expect(toggled.status).toBe(200);
    expect((await toggled.json()).offer.status).toBe('INACTIVE');
    expect((await edited.json()).offer.title).toBe('Patched title');
    expect(events.filter((e) => e.type === 'offer.changed')).toHaveLength(2);
    const actions = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, id))
      .all()
      .map((a) => a.action);
    expect(actions).toEqual(['offer.create', 'offer.toggle', 'offer.update']);
  });

  it('400 for invalid bodies, 404 for unknown offers', async () => {
    const id = await create('Patch invalid');
    expect((await patch(id, {}, cookies.VP)).status).toBe(400);
    expect((await patch(id, { title: 'x' }, cookies.VP)).status).toBe(400);
    expect((await patch(id, { discountType: 'PERCENT', value: 500 }, cookies.VP)).status).toBe(400);
    expect((await patch(id, { unknown: 1 }, cookies.VP)).status).toBe(400);
    expect((await patch('nope', { isActive: false }, cookies.VP)).status).toBe(404);
  });
});

describe('DELETE /api/offers/:id', () => {
  it('401 unauthenticated, 403 for REP and MANAGER', async () => {
    const id = await create('Delete target');
    expect((await remove(id, '')).status).toBe(401);
    expect((await remove(id, cookies.REP)).status).toBe(403);
    expect((await remove(id, cookies.MANAGER)).status).toBe(403);
  });

  it('204 for VP with an audit row; 404 afterwards', async () => {
    const { db } = await import('@/server/db/client');
    const { auditLog } = await import('@/server/db/schema');
    const id = await create('Delete me');
    expect((await remove(id, cookies.VP)).status).toBe(204);
    expect(
      db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, id))
        .all()
        .map((a) => a.action),
    ).toContain('offer.delete');
    expect((await remove(id, cookies.VP)).status).toBe(404);
  });

  it('409 OFFER_IN_USE when a lead applied the offer', async () => {
    const { db } = await import('@/server/db/client');
    const { leads } = await import('@/server/db/schema');
    const id = await create('Applied offer');
    const lead = db.select().from(leads).get()!;
    db.update(leads).set({ appliedOfferId: id }).where(eq(leads.id, lead.id)).run();
    const res = await remove(id, cookies.VP);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('OFFER_IN_USE');
  });
});
