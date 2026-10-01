import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, PASSWORD, req, setupAuthEnv, SOFIA } from '../auth/helpers';

let login: typeof import('@/app/api/auth/login/route').POST;
let GET: typeof import('@/app/api/leads/route').GET;
let cookie: string;

beforeAll(async () => {
  await setupAuthEnv();
  login = (await import('@/app/api/auth/login/route')).POST;
  GET = (await import('@/app/api/leads/route')).GET;
  const res = await login(
    req('/api/auth/login', {
      method: 'POST',
      body: { email: SOFIA, password: PASSWORD },
      headers: { 'x-forwarded-for': '7.7.7.7' },
    }),
  );
  cookie = cookieFrom(res);
});

const get = (qs = '', c: string = cookie) => GET(req(`/api/leads${qs}`, { cookie: c }));

describe('GET /api/leads', () => {
  it('401 UNAUTHENTICATED without a session', async () => {
    const res = await get('', '');
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('200 with the documented response shape for Sofia', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ page: 1, pageSize: 25, view: 'mine', sort: 'rank' });
    expect(body.counts).toEqual(
      expect.objectContaining({ mine: expect.any(Number), unassigned: expect.any(Number) }),
    );
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        reference: expect.any(String),
        customer: expect.objectContaining({ name: expect.any(String) }),
        flags: expect.objectContaining({ overdue: expect.any(Boolean) }),
      }),
    );
    expect(body.total).toBe(body.counts.mine);
  });

  it('400 VALIDATION_ERROR for bad params', async () => {
    for (const qs of ['?stage=NOPE', '?pageSize=7', '?createdFrom=tomorrow', '?sort=random']) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('never reveals out-of-scope owners (no 403, only scope rows)', async () => {
    const me = await (await get()).json();
    const myId = me.items[0].owner.id;
    const res = await get('?owner=someone-else&team=other&view=team');
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const i of body.items) expect(i.owner === null || i.owner.id === myId).toBe(true);
  });

  it('REP asking for the team view gets only their own work, never a teammate lead (P0-1)', async () => {
    const mine = await (await get('?pageSize=50')).json();
    const myId = mine.items[0].owner.id;
    for (const qs of ['?view=team&pageSize=50', '?view=all&pageSize=50']) {
      const res = await get(qs);
      expect(res.status, qs).toBe(200);
      const body = await res.json();
      expect(body.view, qs).toBe('mine');
      for (const i of body.items) expect(i.owner?.id, qs).toBe(myId);
    }
  });

  it('an empty or 1-character search is ignored, not a 400', async () => {
    for (const qs of ['?q=', '?q=a', '?q=%20%20']) {
      const res = await get(qs);
      expect(res.status, qs).toBe(200);
    }
  });

  it('pages cover every lead once (SC-005)', async () => {
    const first = await (await get('?pageSize=10')).json();
    const ids = new Set<string>();
    for (let p = 1; p <= Math.ceil(first.total / 10); p++) {
      const page = await (await get(`?pageSize=10&page=${p}`)).json();
      page.items.forEach((i: { id: string }) => ids.add(i.id));
    }
    expect(ids.size).toBe(first.total);
  });
});
