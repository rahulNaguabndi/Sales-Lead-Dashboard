import { beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { EMAIL, setupActivityEnv, type Ctx } from '../integration/activity-helpers';
import { req } from '../integration/auth/helpers';

let c: Ctx;
let GET: (r: never) => Promise<Response>;
let POST: (r: never) => Promise<Response>;
let dach: string;
let south: string;

const call = (cookie: string | null, qs = '') =>
  GET(req(`/api/audit${qs}`, { cookie: cookie ?? undefined, headers: { host: 'localhost' } }) as never);

beforeAll(async () => {
  c = await setupActivityEnv();
  ({ GET, POST } = (await import('@/app/api/audit/route')) as never);
  dach = c.createLead({ owner: EMAIL.anna });
  south = c.createLead({ owner: EMAIL.sofia });
  const ins = c.sqlite.prepare(
    `insert into audit_log (id, actor_id, action, entity, entity_id, created_at) values (?,?,?,?,?,?)`,
  );
  ins.run(ulid(), c.userId(EMAIL.anna), 'lead.stage', 'lead', dach, Date.now());
  ins.run(ulid(), c.userId(EMAIL.sofia), 'lead.stage', 'lead', south, Date.now());
  ins.run(ulid(), c.userId(EMAIL.isabelle), 'offer.create', 'offer', 'o1', Date.now());
});

describe('GET /api/audit', () => {
  it('401 unauthenticated', async () => {
    expect((await call(null)).status).toBe(401);
  });
  it('403 for REP', async () => {
    expect((await call(await c.login(EMAIL.sofia))).status).toBe(403);
  });
  it('manager sees own team, not other teams or offers', async () => {
    const res = await call(await c.login(EMAIL.lukas), '?limit=100');
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.some((i: { entityId: string }) => i.entityId === dach)).toBe(true);
    expect(items.some((i: { entityId: string }) => i.entityId === south)).toBe(false);
    expect(items.some((i: { entity: string }) => i.entity === 'offer')).toBe(false);
  });
  it('VP sees everything', async () => {
    const { items } = await (await call(await c.login(EMAIL.isabelle), '?limit=100')).json();
    const ids = items.map((i: { entityId: string }) => i.entityId);
    expect(ids).toEqual(expect.arrayContaining([dach, south, 'o1']));
  });
  it('400 INVALID_FILTER for bad input', async () => {
    const vp = await c.login(EMAIL.isabelle);
    for (const qs of ['?limit=500', '?entity=nope', '?cursor=zzz', '?from=9&to=1']) {
      const res = await call(vp, qs);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('INVALID_FILTER');
    }
  });
  it('405 for writes', async () => {
    expect((await POST(req('/api/audit', { method: 'POST', body: {} }) as never)).status).toBe(405);
  });
});
