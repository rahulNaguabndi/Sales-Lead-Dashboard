import { beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
let sofia: string;
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const insertFollowUp = (leadId: string, status = 'PENDING') => {
  const id = ulid();
  const me = c.userId(EMAIL.sofia);
  c.sqlite
    .prepare(
      'insert into follow_ups (id, lead_id, assigned_to, due_at, status, note, created_by, created_at) values (?,?,?,?,?,?,?,?)',
    )
    .run(id, leadId, me, Date.now() + 3_600_000, status, 'Call back', me, Date.now());
  return id;
};

describe('next follow-up', () => {
  it('creates a PENDING follow-up for the owner with a timeline entry', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.post(
      sofia,
      id,
      ok({ nextFollowUp: { dueAt: inHours(24), note: 'Try WhatsApp' } }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.followUp).toMatchObject({ status: 'PENDING', assignedTo: c.userId(EMAIL.sofia) });
    const row = c.sqlite.prepare('select * from follow_ups where lead_id=?').get(id);
    expect(row).toMatchObject({ status: 'PENDING', note: 'Try WhatsApp' });
    const sys = c.sqlite
      .prepare("select note from activities where lead_id=? and type='FOLLOW_UP_SCHEDULED'")
      .get(id) as { note: string };
    expect(sys.note).toMatch(/^Follow-up scheduled for /);
  });

  it('assigns to the actor when the lead has no owner (manager logging on pool lead)', async () => {
    const marco = await c.login(EMAIL.marco);
    const id = c.createLead({ owner: null, team: 'South', stage: 'NEW' });
    const res = await c.post(marco, id, ok({ nextFollowUp: { dueAt: inHours(3) } }));
    expect(res.status).toBe(201);
    expect((await res.json()).followUp.assignedTo).toBe(c.userId(EMAIL.marco));
  });

  it('rejects past and >90 day times', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.post(sofia, id, ok({ nextFollowUp: { dueAt: inHours(-1) } }))).status).toBe(
      400,
    );
    expect(
      (await c.post(sofia, id, ok({ nextFollowUp: { dueAt: inHours(24 * 91) } }))).status,
    ).toBe(400);
  });

  it('completeFollowUpId marks DONE and links the activity', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const fu = insertFollowUp(id);
    const res = await c.post(sofia, id, ok({ completeFollowUpId: fu }));
    expect(res.status).toBe(201);
    const { activity } = await res.json();
    expect(
      c.sqlite
        .prepare('select status, completed_by_activity_id from follow_ups where id=?')
        .get(fu),
    ).toMatchObject({ status: 'DONE', completed_by_activity_id: activity.id });
  });

  it('refuses a foreign or already-done follow-up with 422 and writes nothing', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const other = c.createLead({ stage: 'CONTACTED' });
    const foreign = insertFollowUp(other);
    const done = insertFollowUp(id, 'DONE');
    const before = c.counts();
    for (const fu of [foreign, done]) {
      const res = await c.post(sofia, id, ok({ completeFollowUpId: fu }));
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('INVALID_FOLLOW_UP');
    }
    expect(c.counts()).toEqual(before);
  });
});
