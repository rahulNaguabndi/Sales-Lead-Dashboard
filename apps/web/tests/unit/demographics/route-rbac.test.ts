import { beforeAll, describe, expect, it } from 'vitest';
import { req } from '../../integration/auth/helpers';
import { EMAIL, setupActivityEnv, type Ctx } from '../../integration/activity-helpers';

let c: Ctx;
let GET: (r: Request) => Promise<Response>;
const call = (cookie: string | null, qs = '') =>
  GET(req(`/api/dashboard/demographics${qs}`, { cookie: cookie ?? undefined }));

beforeAll(async () => {
  c = await setupActivityEnv();
  GET = (await import('@/app/api/dashboard/demographics/route')).GET as never;
});

describe('GET /api/dashboard/demographics RBAC', () => {
  it('401 without a session', async () => {
    expect((await call(null)).status).toBe(401);
  });

  it('403 for a REP', async () => {
    expect((await call(await c.login(EMAIL.anna))).status).toBe(403);
  });

  it('400 on invalid query', async () => {
    const cookie = await c.login(EMAIL.isabelle);
    expect((await call(cookie, '?range=forever')).status).toBe(400);
    expect((await call(cookie, '?range=custom')).status).toBe(400);
    expect((await call(cookie, '?country=Germany')).status).toBe(400);
  });

  it('VP sees the whole organization, manager only their team, and ignores a foreign teamId', async () => {
    const vp = await (await call(await c.login(EMAIL.isabelle), '?range=90d')).json();
    const m = await c.login(EMAIL.lukas);
    const mine = await (await call(m)).json();
    const foreign = c.sqlite
      .prepare(`select id from teams where id not in (select team_id from users where email = ?) limit 1`)
      .get(EMAIL.lukas) as { id: string };
    const res = await call(m, `?teamId=${foreign.id}`);
    expect(res.status).toBe(200);
    const withForeign = await res.json();
    const total = (x: typeof vp) => x.channelMix.reduce((s: number, e: { n: number }) => s + e.n, 0);
    expect(total(withForeign)).toBe(total(mine));
    expect(total(vp)).toBeGreaterThanOrEqual(total(mine));
  });
});
