import { beforeAll, describe, expect, it } from 'vitest';
import { DAY, EMAIL, setupFollowUpEnv, type FollowUpEnv } from '../service/helpers';

let c: FollowUpEnv;
beforeAll(async () => {
  c = await setupFollowUpEnv();
});

const future = () => Date.now() + DAY;

describe('POST /api/leads/:id/follow-ups', () => {
  it('401 without a session', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.call(null, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: future() })).status).toBe(401);
  });
  it('rep on own lead -> 201', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.call(sofia, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: future(), note: 'Send quote' });
    expect(res.status).toBe(201);
    expect((await res.json()).followUp.status).toBe('PENDING');
  });
  it('rep on a teammate or other-team lead -> 404; pool lead -> 403', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const mate = c.createLead({ owner: 'marta.garcia@eurodrive.test', stage: 'CONTACTED' });
    const dach = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const pool = c.createLead({ owner: null, team: 'South', stage: 'CONTACTED' });
    expect((await c.call(sofia, 'POST', `/api/leads/${mate}/follow-ups`, { dueAt: future() })).status).toBe(404);
    expect((await c.call(sofia, 'POST', `/api/leads/${dach}/follow-ups`, { dueAt: future() })).status).toBe(404);
    expect((await c.call(sofia, 'POST', `/api/leads/${pool}/follow-ups`, { dueAt: future() })).status).toBe(403);
  });
  it('manager in scope 201, out of scope 404; VP 201', async () => {
    const id = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const lukas = await c.login(EMAIL.lukas);
    const marco = await c.login(EMAIL.marco);
    const vp = await c.login(EMAIL.isabelle);
    expect((await c.call(lukas, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: future() })).status).toBe(201);
    expect((await c.call(marco, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: future() })).status).toBe(404);
    expect((await c.call(vp, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: future() })).status).toBe(201);
  });
  it('past time -> 400 "Pick a future time"; unknown lead -> 404', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.call(sofia, 'POST', `/api/leads/${id}/follow-ups`, { dueAt: Date.now() - DAY });
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.dueAt).toBe('Pick a future time');
    expect((await c.call(sofia, 'POST', '/api/leads/nope/follow-ups', { dueAt: future() })).status).toBe(404);
  });
});

describe('GET /api/follow-ups', () => {
  it('401 without a session; own list 200; owner= rejected for rep and out-of-scope manager', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const marco = await c.login(EMAIL.marco);
    const lukas = await c.login(EMAIL.lukas);
    const anna = c.userId(EMAIL.anna);
    expect((await c.call(null, 'GET', '/api/follow-ups?view=today')).status).toBe(401);
    const own = await c.call(sofia, 'GET', '/api/follow-ups?view=today');
    expect(own.status).toBe(200);
    expect(Array.isArray((await own.json()).items)).toBe(true);
    expect((await c.call(sofia, 'GET', `/api/follow-ups?owner=${anna}`)).status).toBe(403);
    expect((await c.call(marco, 'GET', `/api/follow-ups?owner=${anna}`)).status).toBe(403);
    expect((await c.call(lukas, 'GET', `/api/follow-ups?owner=${anna}`)).status).toBe(200);
    expect((await c.call(sofia, 'GET', '/api/follow-ups?view=bogus')).status).toBe(400);
  });
  it('never includes another user’s follow-ups', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const anna = c.userId(EMAIL.anna);
    const lead = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const id = c.addFollowUp({ leadId: lead, assignedTo: anna, dueAt: Date.now() + 1000 });
    const body = await (await c.call(sofia, 'GET', '/api/follow-ups?view=today')).json();
    expect(body.items.map((i: { id: string }) => i.id)).not.toContain(id);
  });
});

describe('PATCH /api/follow-ups/:id', () => {
  const make = (owner: string) => {
    const lead = c.createLead({ owner, stage: 'CONTACTED' });
    return c.addFollowUp({ leadId: lead, assignedTo: c.userId(owner), dueAt: future() });
  };
  it('401 without a session', async () => {
    expect((await c.call(null, 'PATCH', `/api/follow-ups/${make(EMAIL.sofia)}`, { action: 'complete' })).status).toBe(401);
  });
  it('rep: own 200 (complete/snooze/cancel), other rep 404', async () => {
    const sofia = await c.login(EMAIL.sofia);
    expect((await c.call(sofia, 'PATCH', `/api/follow-ups/${make(EMAIL.sofia)}`, { action: 'complete' })).status).toBe(200);
    expect(
      (await c.call(sofia, 'PATCH', `/api/follow-ups/${make(EMAIL.sofia)}`, { action: 'snooze', dueAt: future() + DAY })).status,
    ).toBe(200);
    expect((await c.call(sofia, 'PATCH', `/api/follow-ups/${make(EMAIL.sofia)}`, { action: 'cancel', note: 'x' })).status).toBe(200);
    expect((await c.call(sofia, 'PATCH', `/api/follow-ups/${make(EMAIL.anna)}`, { action: 'complete' })).status).toBe(404);
  });
  it('manager in scope 200 / out of scope 404; VP 200', async () => {
    const lukas = await c.login(EMAIL.lukas);
    const marco = await c.login(EMAIL.marco);
    const vp = await c.login(EMAIL.isabelle);
    expect((await c.call(lukas, 'PATCH', `/api/follow-ups/${make(EMAIL.anna)}`, { action: 'complete' })).status).toBe(200);
    expect((await c.call(marco, 'PATCH', `/api/follow-ups/${make(EMAIL.anna)}`, { action: 'complete' })).status).toBe(404);
    expect((await c.call(vp, 'PATCH', `/api/follow-ups/${make(EMAIL.anna)}`, { action: 'complete' })).status).toBe(200);
  });
  it('409 when not pending; 400 on invalid action; 404 unknown id', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = make(EMAIL.sofia);
    await c.call(sofia, 'PATCH', `/api/follow-ups/${id}`, { action: 'complete' });
    expect((await c.call(sofia, 'PATCH', `/api/follow-ups/${id}`, { action: 'complete' })).status).toBe(409);
    expect((await c.call(sofia, 'PATCH', `/api/follow-ups/${id}`, { action: 'explode' })).status).toBe(400);
    expect((await c.call(sofia, 'PATCH', '/api/follow-ups/missing', { action: 'complete' })).status).toBe(404);
  });
});
