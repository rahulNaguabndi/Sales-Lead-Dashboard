import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
let sofia: string;
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
});

describe('explicit stage change', () => {
  it('CONTACTED -> QUALIFIED writes history and a system entry', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.post(sofia, id, ok({ stageChange: { to: 'QUALIFIED' } }));
    expect(res.status).toBe(201);
    expect(c.lead(id).stage).toBe('QUALIFIED');
    const hist = c.sqlite
      .prepare('select from_stage, to_stage, reason from stage_history where lead_id=?')
      .all(id);
    expect(hist).toEqual([{ from_stage: 'CONTACTED', to_stage: 'QUALIFIED', reason: 'manual' }]);
    const sys = c.sqlite
      .prepare("select count(*) n from activities where lead_id=? and type='STAGE_CHANGED'")
      .get(id);
    expect(sys).toEqual({ n: 1 });
  });

  it('NEW + contact + stageChange applies auto-advance first, then the explicit move', async () => {
    const id = c.createLead({ stage: 'NEW' });
    const res = await c.post(sofia, id, ok({ stageChange: { to: 'QUALIFIED' } }));
    expect(res.status).toBe(201);
    expect(c.lead(id).stage).toBe('QUALIFIED');
    expect(
      c.sqlite.prepare('select count(*) n from stage_history where lead_id=?').get(id),
    ).toEqual({ n: 2 });
  });

  it('an open move the state machine forbids (QUALIFIED -> NEW) is 422 INVALID_TRANSITION', async () => {
    const id = c.createLead({ stage: 'QUALIFIED' });
    const before = c.counts();
    const res = await c.post(sofia, id, ok({ stageChange: { to: 'NEW' } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION');
    expect(c.counts()).toEqual(before);
  });

  it.each(['WON', 'LOST', 'COLD'])('%s target is rejected by validation', async (to) => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.post(sofia, id, ok({ stageChange: { to } }))).status).toBe(400);
  });

  it('closed leads cannot change stage (422)', async () => {
    const id = c.createLead({ stage: 'WON' });
    const res = await c.post(sofia, id, {
      clientRequestId: c.reqId(),
      type: 'NOTE',
      note: 'x',
      stageChange: { to: 'CONTACTED' },
    });
    expect(res.status).toBe(422);
  });

  it('stale expectedVersion -> 409 STALE_LEAD with nothing written', async () => {
    const id = c.createLead({ stage: 'CONTACTED' }); // version 3
    const before = c.counts();
    const stale = ok({ stageChange: { to: 'QUALIFIED' }, expectedVersion: 2 });
    const res = await c.post(sofia, id, stale);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('STALE_LEAD');
    expect(body.error.currentVersion).toBe(3);
    expect(c.counts()).toEqual(before);
    const good = await c.post(
      sofia,
      id,
      ok({ stageChange: { to: 'QUALIFIED' }, expectedVersion: 3 }),
    );
    expect(good.status).toBe(201);
  });

  it('expectedVersion is ignored without a stage change', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.post(sofia, id, ok({ expectedVersion: 0 }))).status).toBe(201);
  });
});
