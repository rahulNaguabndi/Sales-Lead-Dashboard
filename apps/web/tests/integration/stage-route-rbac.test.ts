import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, setupStageEnv, type StageCtx } from './stage-helpers';

let c: StageCtx;
beforeAll(async () => {
  c = await setupStageEnv();
});
const body = (id: string) => ({ to: 'QUALIFIED', version: c.lead(id).version });

describe('PATCH /api/leads/:id/stage RBAC', () => {
  it('unauthenticated is 401', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(null, id, body(id))).status).toBe(401);
  });

  it('rep moves own lead but not another rep lead', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const anna = await c.login(EMAIL.anna);
    const mine = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(sofia, mine, body(mine))).status).toBe(200);
    const theirs = c.createLead({ stage: 'CONTACTED', owner: EMAIL.anna });
    const res = await c.patch(sofia, theirs, body(theirs));
    expect([403, 404]).toContain(res.status);
    expect(c.lead(theirs).stage).toBe('CONTACTED');
    expect((await c.patch(anna, theirs, body(theirs))).status).toBe(200);
  });

  it('manager moves in-scope leads but not out-of-scope ones', async () => {
    const marco = await c.login(EMAIL.marco);
    const inScope = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(marco, inScope, body(inScope))).status).toBe(200);
    const outScope = c.createLead({ stage: 'CONTACTED', owner: EMAIL.anna });
    const res = await c.patch(marco, outScope, body(outScope));
    expect([403, 404]).toContain(res.status);
    expect(c.lead(outScope).stage).toBe('CONTACTED');
  });

  it('VP moves any lead and may reopen', async () => {
    const isabelle = await c.login(EMAIL.isabelle);
    const id = c.createLead({ stage: 'LOST', owner: EMAIL.anna });
    const res = await c.patch(isabelle, id, { to: 'CONTACTED', version: c.lead(id).version });
    expect(res.status).toBe(200);
  });

  it('rep cannot reopen LOST (403); 422 on invalid body; 409 on stale version', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const lost = c.createLead({ stage: 'LOST' });
    expect((await c.patch(sofia, lost, { to: 'CONTACTED', version: 3 })).status).toBe(403);
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(sofia, id, { to: 'BOGUS', version: 3 })).status).toBe(422);
    expect((await c.patch(sofia, id, { to: 'QUALIFIED' })).status).toBe(422);
    expect((await c.patch(sofia, id, { to: 'QUALIFIED', version: 1 })).status).toBe(409);
  });

  it('unknown lead is 404', async () => {
    const sofia = await c.login(EMAIL.sofia);
    expect((await c.patch(sofia, 'missing', { to: 'QUALIFIED', version: 0 })).status).toBe(404);
  });
});
