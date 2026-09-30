import { beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';
import type { StepName } from '@/server/services/activity';

let c: Ctx;
let sofia: string;
let svc: typeof import('@/server/services/activity');
let shared: typeof import('@leaddesk/shared');
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
  svc = await import('@/server/services/activity');
  shared = await import('@leaddesk/shared');
});

const STEPS: StepName[] = [
  'insert_activity',
  'attempt_count',
  'bookkeeping',
  'auto_advance',
  'stage_change',
  'follow_up_create',
  'follow_up_complete',
  'score',
  'version',
  'audit',
];

async function user() {
  const { getSessionUser } = await import('@/server/auth/session');
  return (await getSessionUser(sofia.split('=')[1]))!;
}

const fullInput = (completeFollowUpId: string) =>
  shared.CreateActivitySchema.parse(
    ok({
      outcome: 'INTERESTED',
      nextFollowUp: { dueAt: new Date(Date.now() + 86_400_000).toISOString() },
      completeFollowUpId,
      stageChange: { to: 'QUALIFIED' },
      expectedVersion: 3,
    }),
  );

function prep() {
  const id = c.createLead({ stage: 'NEW', score: 99, priority: 'HOT' });
  const fu = ulid();
  const me = c.userId(EMAIL.sofia);
  c.sqlite
    .prepare(
      'insert into follow_ups (id, lead_id, assigned_to, due_at, status, created_by, created_at) values (?,?,?,?,?,?,?)',
    )
    .run(fu, id, me, Date.now(), 'PENDING', me, Date.now());
  return { id, fu };
}

describe('atomicity and idempotency', () => {
  it.each(STEPS)('a failure at step %s leaves 0 new rows and the lead unchanged', async (step) => {
    const { id, fu } = prep();
    const beforeCounts = c.counts();
    const beforeLead = c.lead(id);
    const beforeFu = c.sqlite.prepare('select * from follow_ups where id=?').get(fu);
    await expect(
      svc.logActivity(await user(), id, fullInput(fu), {
        onStep: (s) => {
          if (s === step) throw new Error(`boom at ${s}`);
        },
      }),
    ).rejects.toThrow(`boom at ${step}`);
    expect(c.counts()).toEqual(beforeCounts);
    expect(c.lead(id)).toEqual(beforeLead);
    expect(c.sqlite.prepare('select * from follow_ups where id=?').get(fu)).toEqual(beforeFu);
  });

  it('the same input succeeds when no fault is injected (every step ran)', async () => {
    const { id, fu } = prep();
    const seen: string[] = [];
    const res = await svc.logActivity(await user(), id, fullInput(fu), {
      onStep: (s) => seen.push(s),
    });
    expect(seen).toEqual(STEPS);
    expect(res.lead.stage).toBe('QUALIFIED');
    expect(res.followUp).not.toBeNull();
  });

  it('replay returns the original payload and writes nothing', async () => {
    const id = c.createLead({ stage: 'NEW', score: 99, priority: 'HOT' });
    const body = ok({
      outcome: 'INTERESTED',
      nextFollowUp: { dueAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    const first = await c.post(sofia, id, body);
    expect(first.status).toBe(201);
    const a = await first.json();
    const counts = c.counts();
    const second = await c.post(sofia, id, body);
    expect(second.status).toBe(201);
    const b = await second.json();
    expect(c.counts()).toEqual(counts);
    expect(b.activity.id).toBe(a.activity.id);
    expect(b.systemActivities.map((s: { id: string }) => s.id)).toEqual(
      a.systemActivities.map((s: { id: string }) => s.id),
    );
    expect(b.followUp.id).toBe(a.followUp.id);
    expect(b.lead.version).toBe(a.lead.version);
  });

  it('the same request id on another lead is a new activity', async () => {
    const one = c.createLead({ stage: 'CONTACTED' });
    const two = c.createLead({ stage: 'CONTACTED' });
    const body = ok();
    await c.post(sofia, one, body);
    const before = c.counts();
    expect((await c.post(sofia, two, body)).status).toBe(201);
    expect(c.counts().activities).toBe(before.activities + 1);
  });

  it('a request id older than 10 minutes is not treated as a replay', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const body = shared.CreateActivitySchema.parse(ok());
    const old = Date.now() - 11 * 60_000;
    await svc.logActivity(await user(), id, body, { now: old });
    const users = () =>
      c.sqlite.prepare("select count(*) n from activities where lead_id=? and kind='USER'").get(id);
    expect(users()).toEqual({ n: 1 });
    await svc.logActivity(await user(), id, body);
    expect(users()).toEqual({ n: 2 });
  });

  it('publish failure still returns 201', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await svc.logActivity(await user(), id, shared.CreateActivitySchema.parse(ok()), {
      publish: () => {
        throw new Error('redis exploded');
      },
    });
    expect(res.activity.id).toBeTruthy();
    expect(c.lead(id).version).toBe(4);
  });

  it('publishes activity.created per inserted row in order, then lead.updated', async () => {
    const id = c.createLead({ stage: 'NEW' });
    const events: { type: string }[] = [];
    const res = await svc.logActivity(await user(), id, shared.CreateActivitySchema.parse(ok()), {
      publish: (e) => void events.push(e),
    });
    const created = 1 + res.systemActivities.length;
    expect(events.map((e) => e.type)).toEqual([
      ...Array<string>(created).fill('activity.created'),
      'lead.updated',
    ]);
  });

  it('concurrent submits with different ids both succeed', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const [a, b] = await Promise.all([c.post(sofia, id, ok()), c.post(sofia, id, ok())]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const n = c.sqlite
      .prepare("select count(*) n from activities where lead_id=? and kind='USER'")
      .get(id);
    expect(n).toEqual({ n: 2 });
  });
});
