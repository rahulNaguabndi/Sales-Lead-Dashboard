import { beforeAll, describe, expect, it } from 'vitest';
import { DAY, EMAIL, HOUR, setupFollowUpEnv, type FollowUpEnv } from './helpers';

let c: FollowUpEnv;
let svc: typeof import('@/server/services/followup');
beforeAll(async () => {
  c = await setupFollowUpEnv();
  svc = await import('@/server/services/followup');
});

const rows = (leadId: string) =>
  c.sqlite.prepare('select * from follow_ups where lead_id = ? order by created_at, id').all(leadId) as {
    id: string;
    status: string;
    note: string | null;
    assigned_to: string;
    due_at: number;
    completed_at: number | null;
  }[];
const sys = (leadId: string, action: string) =>
  (
    c.sqlite
      .prepare(
        "select metadata from activities where lead_id = ? and kind='SYSTEM' and type in ('FOLLOW_UP_SCHEDULED','FOLLOW_UP_MISSED')",
      )
      .all(leadId) as { metadata: string }[]
  ).filter((r) => JSON.parse(r.metadata).action === action);

describe('create', () => {
  it('assigns to the lead owner and writes a scheduled activity + audit', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const before = c.counts();
    const f = await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, { publish: () => undefined });
    expect(f.assignedTo).toBe(sofia.id);
    expect(f.status).toBe('PENDING');
    const after = c.counts();
    expect(after.followUps).toBe(before.followUps + 1);
    expect(after.activities).toBe(before.activities + 1);
    expect(after.audit).toBe(before.audit + 1);
    expect(sys(lead, 'scheduled')).toHaveLength(1);
  });

  it('unassigned lead -> assigned to the caller', async () => {
    const marco = c.user(EMAIL.marco);
    const lead = c.createLead({ owner: null, team: 'South', stage: 'CONTACTED' });
    const f = await svc.create(marco, lead, { dueAt: Date.now() + DAY }, { publish: () => undefined });
    expect(f.assignedTo).toBe(marco.id);
  });

  it('supersedes the previous PENDING follow-up for the same assignee', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const pub = { publish: () => undefined };
    const a = await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, pub);
    const b = await svc.create(sofia, lead, { dueAt: Date.now() + 2 * DAY }, pub);
    const r = rows(lead);
    expect(r.find((x) => x.id === a.id)).toMatchObject({ status: 'CANCELLED', note: 'Superseded' });
    expect(r.find((x) => x.id === b.id)!.status).toBe('PENDING');
    expect(sys(lead, 'superseded')).toHaveLength(1);
  });

  it('a different assignee is not superseded', async () => {
    const sofia = c.user(EMAIL.sofia);
    const marco = c.user(EMAIL.marco);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const other = c.addFollowUp({ leadId: lead, assignedTo: marco.id, dueAt: Date.now() + DAY });
    await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, { publish: () => undefined });
    expect(rows(lead).find((x) => x.id === other)!.status).toBe('PENDING');
  });

  it('rejects past, too-far and closed-lead follow-ups', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    await expect(svc.create(sofia, lead, { dueAt: Date.now() - HOUR })).rejects.toThrow('Pick a future time');
    await expect(svc.create(sofia, lead, { dueAt: Date.now() + 91 * DAY })).rejects.toThrow(/90 days/);
    const won = c.createLead({ stage: 'WON' });
    await expect(svc.create(sofia, won, { dueAt: Date.now() + DAY })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('publishes activity.created and lead.updated after commit, and survives publish failure', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const seen: string[] = [];
    await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, { publish: (e) => void seen.push(e.type) });
    expect(seen).toEqual(['activity.created', 'lead.updated']);
    const lead2 = c.createLead({ stage: 'CONTACTED' });
    await expect(
      svc.create(sofia, lead2, { dueAt: Date.now() + DAY }, {
        publish: () => {
          throw new Error('bus down');
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('transitions', () => {
  const pub = { publish: () => undefined };
  it('mark done without activity records a system entry', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const f = await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, pub);
    const done = await svc.complete(sofia, f.id, pub);
    expect(done.status).toBe('DONE');
    expect(done.completedAt).toBeTruthy();
    expect(done.completedByActivityId).toBeNull();
    const [entry] = sys(lead, 'done_without_activity');
    expect(entry).toBeTruthy();
    const note = c.sqlite
      .prepare("select note from activities where lead_id=? and metadata like '%done_without_activity%'")
      .get(lead) as { note: string };
    expect(note.note).toBe('Follow-up marked done without activity');
  });

  it('snooze moves dueAt and records rescheduledFrom', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const due = Date.now() + HOUR;
    const f = await svc.create(sofia, lead, { dueAt: due }, pub);
    const s = await svc.snooze(sofia, f.id, due + DAY, pub);
    expect(s.dueAt).toBe(due + DAY);
    const [entry] = sys(lead, 'snoozed');
    expect(JSON.parse(entry!.metadata).rescheduledFrom).toBe(due);
  });

  it('cancel stores the note; acting on a non-PENDING follow-up -> 409', async () => {
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const f = await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, pub);
    const x = await svc.cancel(sofia, f.id, 'Customer on holiday', pub);
    expect(x).toMatchObject({ status: 'CANCELLED', note: 'Customer on holiday' });
    await expect(svc.complete(sofia, f.id, pub)).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.snooze(sofia, f.id, Date.now() + DAY, pub)).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.cancel(sofia, f.id, undefined, pub)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('completeInTx links the completing activity', async () => {
    const { withTx } = await import('@/server/db/client');
    const sofia = c.user(EMAIL.sofia);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const f = await svc.create(sofia, lead, { dueAt: Date.now() + DAY }, pub);
    const act = c.sqlite.prepare('select id from activities where lead_id = ? limit 1').get(lead) as { id: string };
    const done = withTx((tx) => svc.completeInTx(tx, f.id, lead, act.id, Date.now(), sofia.id));
    expect(done.completedByActivityId).toBe(act.id);
  });
});

describe('listForUser', () => {
  it('counts and order match a direct query; overdue first', async () => {
    const anna = c.user(EMAIL.anna);
    const now = Date.now();
    const mk = () => c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const dueAt = [now - 5 * HOUR, now - HOUR, now + 1000, now + 2000];
    for (const d of dueAt) c.addFollowUp({ leadId: mk(), assignedTo: anna.id, dueAt: d });
    c.addFollowUp({ leadId: mk(), assignedTo: anna.id, dueAt: now + 3 * DAY });
    c.addFollowUp({ leadId: mk(), assignedTo: anna.id, dueAt: now - DAY, status: 'DONE' });

    // Fixed "end of today" far enough in the future for the today items, before +3 days.
    const res = await svc.listForUser(anna, { view: 'today' }, { now });
    const direct = c.sqlite
      .prepare(
        "select count(*) n from follow_ups f join leads l on l.id=f.lead_id where f.assigned_to=? and f.status='PENDING' and l.stage in ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION') and f.due_at < ?",
      )
      .get(anna.id, new Date(new Date(now).setUTCHours(24, 0, 0, 0)).getTime()) as { n: number };
    expect(res.items.length).toBe(direct.n);
    expect(res.counts.dueToday).toBe(direct.n);
    expect(res.items[0]!.overdue).toBe(true);
    const sorted = [...res.items].sort((a, b) => a.dueAt - b.dueAt);
    expect(res.items.map((i) => i.id)).toEqual(sorted.map((i) => i.id));
    const overdue = await svc.listForUser(anna, { view: 'overdue' }, { now });
    expect(overdue.items.every((i) => i.overdue)).toBe(true);
    expect(overdue.counts.overdue).toBe(res.counts.overdue);
    const upcoming = await svc.listForUser(anna, { view: 'upcoming' }, { now });
    expect(upcoming.items.map((i) => i.dueAt)).toContain(now + 3 * DAY);
  });

  it('manager may list a rep in scope; rep cannot use owner=; manager out of scope is 403', async () => {
    const anna = c.user(EMAIL.anna);
    const lukas = c.user(EMAIL.lukas);
    const marco = c.user(EMAIL.marco);
    const sofia = c.user(EMAIL.sofia);
    await expect(svc.listForUser(lukas, { view: 'today', owner: anna.id })).resolves.toBeTruthy();
    await expect(svc.listForUser(sofia, { view: 'today', owner: anna.id })).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.listForUser(marco, { view: 'today', owner: anna.id })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('reassign / cancelAll', () => {
  it('moves only PENDING follow-ups to the new owner', async () => {
    const { withTx } = await import('@/server/db/client');
    const sofia = c.user(EMAIL.sofia);
    const marco = c.user(EMAIL.marco);
    const lead = c.createLead({ stage: 'CONTACTED' });
    const pending = c.addFollowUp({ leadId: lead, assignedTo: sofia.id, dueAt: Date.now() + DAY });
    const done = c.addFollowUp({ leadId: lead, assignedTo: sofia.id, dueAt: Date.now() - DAY, status: 'DONE' });
    withTx((tx) => svc.reassignPending(tx, lead, marco.id));
    const r = rows(lead);
    expect(r.find((x) => x.id === pending)!.assigned_to).toBe(marco.id);
    expect(r.find((x) => x.id === done)!.assigned_to).toBe(sofia.id);
    withTx((tx) => svc.cancelAllForLead(tx, lead, Date.now()));
    expect(rows(lead).find((x) => x.id === pending)!.status).toBe('CANCELLED');
  });
});
