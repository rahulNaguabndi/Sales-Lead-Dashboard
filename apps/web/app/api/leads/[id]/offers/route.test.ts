import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { EMAILS, loginAs, req, setupAuthEnv } from '@/tests/integration/offers/helpers';

let GET: typeof import('./route').GET;
let cookies: Record<keyof typeof EMAILS, string>;
let ownLead: string;
let foreignLead: string;

const call = (id: string, cookie: string) =>
  GET(req(`/api/leads/${id}/offers`, { cookie }), { params: { id } });

beforeAll(async () => {
  await setupAuthEnv();
  ({ GET } = await import('./route'));
  const { db } = await import('@/server/db/client');
  const { leads, users } = await import('@/server/db/schema');
  cookies = {
    REP: await loginAs(EMAILS.REP),
    MANAGER: await loginAs(EMAILS.MANAGER),
    OTHER_MANAGER: await loginAs(EMAILS.OTHER_MANAGER),
    VP: await loginAs(EMAILS.VP),
  };
  const sofia = db.select().from(users).where(eq(users.email, EMAILS.REP)).get()!;
  ownLead = db.select().from(leads).where(eq(leads.ownerId, sofia.id)).get()!.id;
  foreignLead = db
    .select()
    .from(leads)
    .all()
    .find((l) => l.teamId !== sofia.teamId && l.ownerId !== null)!.id;
});

describe('GET /api/leads/:id/offers', () => {
  it('401 without a session', async () => {
    expect((await call(ownLead, '')).status).toBe(401);
  });

  it('200 for a rep on their own lead, with the documented shape', async () => {
    const res = await call(ownLead, cookies.REP);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.offers)).toBe(true);
    for (const o of body.offers) {
      expect(o).toEqual(
        expect.objectContaining({
          offer: expect.objectContaining({ id: expect.any(String), title: expect.any(String) }),
          reasons: expect.any(Array),
          endsSoon: expect.any(Boolean),
        }),
      );
      expect(o.offer.title).not.toBe('Summer Sale'); // expired seed offer
    }
  });

  it('denies a rep on an out-of-scope lead (policy answers 404, never the data)', async () => {
    const res = await call(foreignLead, cookies.REP);
    expect([403, 404]).toContain(res.status);
    expect((await res.json()).offers).toBeUndefined();
  });

  it('200 for the manager of the team and for the VP', async () => {
    expect((await call(ownLead, cookies.MANAGER)).status).toBe(200);
    expect((await call(ownLead, cookies.VP)).status).toBe(200);
  });

  it('denies a manager of another team', async () => {
    expect([403, 404]).toContain((await call(ownLead, cookies.OTHER_MANAGER)).status);
  });

  it('404 for an unknown lead', async () => {
    expect((await call('does-not-exist', cookies.VP)).status).toBe(404);
  });
});
