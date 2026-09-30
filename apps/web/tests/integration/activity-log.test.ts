import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
let sofia: string;
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
});

describe('POST /api/leads/:id/activities happy path', () => {
  it('persists rows, updates the lead, audits, and matches the contract', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const before = c.counts();
    const res = await c.post(sofia, id, ok({ note: 'Called customer, interested in test drive' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.activity).toMatchObject({
      kind: 'USER',
      type: 'CALL',
      outcome: 'CONNECTED',
      note: 'Called customer, interested in test drive',
      aiAssisted: false,
      actor: { name: 'Sofia Rossi' },
    });
    expect(body.activity.metadata.clientRequestId).toHaveLength(26);
    expect(body.lead).toMatchObject({ id, stage: 'CONTACTED', version: 4, attemptCount: 0 });
    expect(Array.isArray(body.systemActivities)).toBe(true);
    expect(body.followUp).toBeNull();

    const after = c.counts();
    expect(after.activities - before.activities).toBe(1 + body.systemActivities.length);
    expect(after.audit - before.audit).toBe(1);
    const row = c.lead(id);
    expect(row.version).toBe(4);
    expect(row.last_activity_at).toBe(body.activity.createdAt);
    expect(row.last_contact_at).toBe(body.activity.createdAt);
    const audit = c.sqlite
      .prepare(
        "select action, entity from audit_log where action='activity.create' and entity_id=?",
      )
      .get(id);
    expect(audit).toMatchObject({ entity: 'lead' });
  });

  it('survives closing and reopening the database connection', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.post(sofia, id, ok({ note: 'persist me' }));
    const { activity } = await res.json();
    const { openDatabase } = await import('@/server/db/client');
    const fresh = openDatabase(process.env.DATABASE_URL!);
    const row = fresh.sqlite
      .prepare('select note, type, outcome from activities where id = ?')
      .get(activity.id);
    fresh.sqlite.close();
    expect(row).toEqual({ note: 'persist me', type: 'CALL', outcome: 'CONNECTED' });
  });

  it('works with Redis unreachable (bus degraded)', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.post(sofia, id, ok())).status).toBe(201);
  });
});
