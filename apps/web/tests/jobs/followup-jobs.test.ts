import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { DAY, EMAIL, HOUR, setupFollowUpEnv, type FollowUpEnv } from '../service/helpers';

let c: FollowUpEnv;
beforeAll(async () => {
  c = await setupFollowUpEnv();
});
afterEach(() => vi.useRealTimers());

const collect = () => {
  const events: LeadDeskEvent[] = [];
  return { events, publish: (e: LeadDeskEvent) => void events.push(e) };
};
const setLead = (id: string, o: { lastContactAt?: number | null; createdAt?: number; attempts?: number }) =>
  c.sqlite
    .prepare(
      'update leads set last_contact_at = ?, created_at = coalesce(?, created_at), attempt_count = coalesce(?, attempt_count) where id = ?',
    )
    .run(o.lastContactAt ?? null, o.createdAt ?? null, o.attempts ?? null, id);
const stage = (id: string) => (c.lead(id) as { stage: string }).stage;

describe('follow-up sweeper', () => {
  it('marks 25 h overdue PENDING as MISSED once, with a FOLLOW_UP_MISSED activity', async () => {
    const { runFollowUpSweeper } = await import('@/server/jobs/followup-sweeper');
    const now = Date.now();
    const lead = c.createLead({ stage: 'CONTACTED' });
    const id = c.addFollowUp({ leadId: lead, assignedTo: c.userId(EMAIL.sofia), dueAt: now - 25 * HOUR });
    const done = c.addFollowUp({ leadId: lead, assignedTo: c.userId(EMAIL.sofia), dueAt: now - 30 * HOUR, status: 'DONE' });
    const p = collect();
    expect((await runFollowUpSweeper({ now, publish: p.publish })).missed).toBeGreaterThanOrEqual(1);
    const st = (fid: string) => (c.sqlite.prepare('select status from follow_ups where id=?').get(fid) as { status: string }).status;
    expect(st(id)).toBe('MISSED');
    expect(st(done)).toBe('DONE');
    const n = c.sqlite.prepare("select count(*) n from activities where lead_id=? and type='FOLLOW_UP_MISSED'").get(lead) as { n: number };
    expect(n.n).toBe(1);
    await runFollowUpSweeper({ now, publish: p.publish });
    const n2 = c.sqlite.prepare("select count(*) n from activities where lead_id=? and type='FOLLOW_UP_MISSED'").get(lead) as { n: number };
    expect(n2.n).toBe(1);
  });

  it('within 23 h overdue stays PENDING', async () => {
    const { runFollowUpSweeper } = await import('@/server/jobs/followup-sweeper');
    const now = Date.now();
    const lead = c.createLead({ stage: 'CONTACTED' });
    const id = c.addFollowUp({ leadId: lead, assignedTo: c.userId(EMAIL.sofia), dueAt: now - 23 * HOUR });
    await runFollowUpSweeper({ now, publish: () => undefined });
    expect((c.sqlite.prepare('select status from follow_ups where id=?').get(id) as { status: string }).status).toBe('PENDING');
  });

  it('emits followup.due exactly once across two runs (in-memory dedupe) to the assignee', async () => {
    const { runFollowUpSweeper, resetSweeperForTests } = await import('@/server/jobs/followup-sweeper');
    resetSweeperForTests();
    const now = Date.now();
    const lead = c.createLead({ stage: 'CONTACTED' });
    const sofia = c.userId(EMAIL.sofia);
    const id = c.addFollowUp({ leadId: lead, assignedTo: sofia, dueAt: now + 3 * 60_000 });
    const p = collect();
    await runFollowUpSweeper({ now, publish: p.publish });
    await runFollowUpSweeper({ now: now + 60_000, publish: p.publish });
    const due = p.events.filter((e) => e.type === 'followup.due' && e.followUpId === id);
    expect(due).toHaveLength(1);
    expect(due[0]!.ownerId).toBe(sofia);
  });

  it('does not notify for follow-ups due beyond 5 minutes', async () => {
    const { runFollowUpSweeper, resetSweeperForTests } = await import('@/server/jobs/followup-sweeper');
    resetSweeperForTests();
    const now = Date.now();
    const lead = c.createLead({ stage: 'CONTACTED' });
    const id = c.addFollowUp({ leadId: lead, assignedTo: c.userId(EMAIL.sofia), dueAt: now + 10 * 60_000 });
    const p = collect();
    await runFollowUpSweeper({ now, publish: p.publish });
    expect(p.events.some((e) => e.type === 'followup.due' && e.followUpId === id)).toBe(false);
  });
});

describe('cold detector', () => {
  it('idle 8 d with a recent NOTE -> COLD with AUTO_COLD, changed_by null and reason', async () => {
    const { runColdDetector } = await import('@/server/jobs/cold-detector');
    const now = Date.now();
    const lead = c.createLead({ stage: 'QUALIFIED' });
    setLead(lead, { lastContactAt: now - 8 * DAY });
    c.sqlite
      .prepare(
        "insert into activities (id, lead_id, actor_id, kind, type, note, ai_assisted, created_at) values (?,?,?,'USER','NOTE','fyi',0,?)",
      )
      .run(`n-${lead}`, lead, c.userId(EMAIL.sofia), now - DAY);
    const p = collect();
    await runColdDetector({ now, publish: p.publish });
    expect(stage(lead)).toBe('COLD');
    const h = c.sqlite.prepare('select changed_by, reason, to_stage from stage_history where lead_id=? order by changed_at desc').get(lead) as {
      changed_by: string | null;
      reason: string;
      to_stage: string;
    };
    expect(h).toMatchObject({ changed_by: null, reason: 'No activity 7 days', to_stage: 'COLD' });
    expect(c.sqlite.prepare("select count(*) n from activities where lead_id=? and type='AUTO_COLD'").get(lead)).toEqual({ n: 1 });
    expect(
      p.events.filter((e) => 'leadId' in e && e.leadId === lead).map((e) => e.type),
    ).toEqual(['activity.created', 'lead.updated']);
  });

  it('future follow-up protects the 7-day rule but not the unanswered rule', async () => {
    const { runColdDetector } = await import('@/server/jobs/cold-detector');
    const now = Date.now();
    const sofia = c.userId(EMAIL.sofia);
    const a = c.createLead({ stage: 'QUALIFIED' });
    const b = c.createLead({ stage: 'QUALIFIED', attemptCount: 3 });
    for (const l of [a, b]) {
      setLead(l, { lastContactAt: now - 8 * DAY, attempts: l === b ? 3 : 0 });
      c.addFollowUp({ leadId: l, assignedTo: sofia, dueAt: now + DAY });
    }
    await runColdDetector({ now, publish: () => undefined });
    expect(stage(a)).toBe('QUALIFIED');
    expect(stage(b)).toBe('COLD');
    const r = c.sqlite.prepare('select reason from stage_history where lead_id=? order by changed_at desc').get(b) as { reason: string };
    expect(r.reason).toBe('3 unanswered attempts');
  });

  it('NEW lead counts from createdAt; closed and fresh leads are untouched', async () => {
    const { runColdDetector } = await import('@/server/jobs/cold-detector');
    const now = Date.now();
    const fresh = c.createLead({ stage: 'NEW' });
    const old = c.createLead({ stage: 'NEW' });
    const won = c.createLead({ stage: 'WON' });
    setLead(fresh, { lastContactAt: null, createdAt: now - 2 * DAY });
    setLead(old, { lastContactAt: null, createdAt: now - 9 * DAY });
    setLead(won, { lastContactAt: now - 30 * DAY, attempts: 5 });
    await runColdDetector({ now, publish: () => undefined });
    expect([stage(fresh), stage(old), stage(won)]).toEqual(['NEW', 'COLD', 'WON']);
  });

  it('one failing lead does not abort the run', async () => {
    const { runColdDetector } = await import('@/server/jobs/cold-detector');
    const now = Date.now();
    const l1 = c.createLead({ stage: 'CONTACTED' });
    const l2 = c.createLead({ stage: 'CONTACTED' });
    setLead(l1, { lastContactAt: now - 20 * DAY });
    setLead(l2, { lastContactAt: now - 19 * DAY });
    c.sqlite.exec(
      `create trigger fail_one before insert on stage_history when new.lead_id = '${l1}' begin select raise(abort, 'boom'); end;`,
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await runColdDetector({ now, publish: () => undefined });
    warn.mockRestore();
    c.sqlite.exec('drop trigger fail_one');
    expect(res.failed).toBe(1);
    expect([stage(l1), stage(l2)]).toEqual(['CONTACTED', 'COLD']);
  });

  it('SC-001: every cold-eligible seeded lead is COLD after 2 runs; batch limited to 200', async () => {
    const { runColdDetector, COLD_BATCH_LIMIT } = await import('@/server/jobs/cold-detector');
    const now = Date.now();
    expect(COLD_BATCH_LIMIT).toBe(200);
    for (let i = 0; i < 3; i++) setLead(c.createLead({ stage: 'CONTACTED' }), { lastContactAt: now - (9 + i) * DAY });
    const r1 = await runColdDetector({ now, publish: () => undefined });
    const r2 = await runColdDetector({ now, publish: () => undefined });
    expect(r1.cold).toBeGreaterThan(0);
    expect(r2.cold).toBe(0);
    const left = c.sqlite
      .prepare(
        `select count(*) n from leads l where l.stage in ('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')
         and (l.attempt_count >= 3 or (coalesce(l.last_contact_at, l.created_at) <= ?
         and not exists (select 1 from follow_ups f where f.lead_id=l.id and f.status='PENDING' and f.due_at > ?)))`,
      )
      .get(now - 7 * DAY, now) as { n: number };
    expect(left.n).toBe(0);
  });
});

describe('job lock and scheduler', () => {
  it('in-process lock skips a concurrent run (Redis unavailable)', async () => {
    const { withJobLock, resetJobLocksForTests } = await import('@/server/jobs/lock');
    resetJobLocksForTests();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let inner: string | null | undefined;
    const outer = await withJobLock('t', async () => {
      inner = await withJobLock('t', () => 'nested');
      return 'outer';
    });
    expect(outer).toBe('outer');
    expect(inner).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Redis unavailable'));
    expect(await withJobLock('t', () => 'again')).toBe('again');
    warn.mockRestore();
  });

  it('startJobs is guarded, honours JOBS_ENABLED=false and isolates job errors', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { startJobs, runJob } = await import('@/server/jobs');
    process.env.JOBS_ENABLED = 'false';
    expect(startJobs([])).toBeNull();
    process.env.JOBS_ENABLED = 'true';
    const run = vi.fn(async () => ({ ok: 1 }));
    const first = startJobs([{ name: 'x', everyMs: 1000, run }]);
    const second = startJobs([{ name: 'x', everyMs: 1000, run }]);
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(3100);
    expect(run).toHaveBeenCalledTimes(3);
    first!.stop();
    await runJob({
      name: 'boom',
      run: async () => {
        throw new Error('kaput');
      },
    });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('kaput'));
    delete process.env.JOBS_ENABLED;
  });

  it('score-freshness runs F09 recompute and publishes priority changes', async () => {
    const { runScoreFreshness } = await import('@/server/jobs/score-freshness');
    const p = collect();
    const r = await runScoreFreshness({ now: Date.now(), publish: p.publish });
    expect(r.priorityChanged).toBe(p.events.length);
  });
});
