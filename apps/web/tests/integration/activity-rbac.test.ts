import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
beforeAll(async () => {
  c = await setupActivityEnv();
});

describe('activity RBAC', () => {
  it('rep on own lead -> 201', async () => {
    const sofia = await c.login(EMAIL.sofia);
    expect((await c.post(sofia, c.createLead({ stage: 'CONTACTED' }), ok())).status).toBe(201);
  });

  it('rep on an unassigned pool lead in own team -> 403', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const pool = c.createLead({ owner: null, team: 'South' });
    const before = c.counts();
    const res = await c.post(sofia, pool, ok());
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
    expect(c.counts()).toEqual(before);
  });

  it('rep on a teammate lead -> 404 (outside the rep scope per F03)', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ owner: 'marta.garcia@eurodrive.test' });
    expect((await c.post(sofia, id, ok())).status).toBe(404);
  });

  it('manager on a rep lead in scope -> 201 with the manager as actor', async () => {
    const marco = await c.login(EMAIL.marco);
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.post(marco, id, ok());
    expect(res.status).toBe(201);
    expect((await res.json()).activity.actor.name).toBe('Marco Bianchi');
    const row = c.sqlite
      .prepare("select actor_id from activities where lead_id=? and kind='USER'")
      .get(id) as { actor_id: string };
    expect(row.actor_id).toBe(c.userId(EMAIL.marco));
  });

  it('Lukas (DACH manager) can log on an Anna Weber lead', async () => {
    const lukas = await c.login(EMAIL.lukas);
    const id = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const res = await c.post(lukas, id, ok());
    expect(res.status).toBe(201);
    expect((await res.json()).activity.actor.name).toBe('Lukas Becker');
  });

  it('VP can log on any lead', async () => {
    const vp = await c.login(EMAIL.isabelle);
    const id = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    expect((await c.post(vp, id, ok())).status).toBe(201);
  });

  it('Sofia on a DACH lead -> 404 (no existence leak); manager of another team too', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const marco = await c.login(EMAIL.marco);
    const id = c.createLead({ owner: EMAIL.anna });
    const before = c.counts();
    for (const cookie of [sofia, marco]) {
      const res = await c.post(cookie, id, ok());
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
    expect((await c.post(sofia, 'does-not-exist', ok())).status).toBe(404);
    expect(c.counts()).toEqual(before);
  });

  it('unauthenticated -> 401', async () => {
    const id = c.createLead();
    const res = await c.post(null, id, ok());
    expect(res.status).toBe(401);
  });

  it('bad Origin -> 403', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.post(sofia, id, ok(), { origin: 'http://evil.example' });
    expect(res.status).toBe(403);
  });

  it('closed lead rejects contact types but accepts notes', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'LOST' });
    expect((await c.post(sofia, id, ok())).status).toBe(403);
    const note = { clientRequestId: c.reqId(), type: 'NOTE', note: 'n' };
    expect((await c.post(sofia, id, note)).status).toBe(201);
  });
});
