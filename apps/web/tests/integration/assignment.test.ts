import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, setupActivityEnv, type Ctx } from './activity-helpers';

const EM = {
  ...EMAIL,
  jonas: 'jonas.fischer@eurodrive.test',
  lea: 'lea.hoffmann@eurodrive.test',
  felix: 'felix.wagner@eurodrive.test',
};

const OPEN = "('NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION')";

type Svc = typeof import('@/server/services/assignment');
type User = Parameters<Svc['claim']>[0];
let c: Ctx;
let svc: Svc;

const user = (email: string): User => {
  const r = c.sqlite
    .prepare('select id, name, email, role, team_id from users where email = ?')
    .get(email) as { id: string; name: string; email: string; role: User['role']; team_id: string };
  return { id: r.id, name: r.name, email: r.email, role: r.role, teamId: r.team_id };
};
const one = <T>(sql: string, ...args: unknown[]) => c.sqlite.prepare(sql).get(...args) as T;
const count = (sql: string, ...args: unknown[]) => one<{ n: number }>(sql, ...args).n;
const pool = () => c.createLead({ owner: null, team: 'DACH' });
const setMax = (email: string, n: number) =>
  c.sqlite.prepare('update users set max_open_leads = ? where email = ?').run(n, email);
const lastNote = (leadId: string) =>
  one<{ note: string }>(
    'select note from activities where lead_id = ? order by created_at desc, id desc limit 1',
    leadId,
  ).note;

beforeAll(async () => {
  c = await setupActivityEnv();
  svc = await import('@/server/services/assignment');
});

describe('claim (US-1)', () => {
  it('claims, writes CLAIMED activity + audit, bumps version', async () => {
    const id = pool();
    const before = c.counts();
    const r = await svc.claim(user(EM.anna), id);
    expect(r.lead.ownerId).toBe(user(EM.anna).id);
    expect(r.lead.version).toBe(4);
    expect(lastNote(id)).toBe('Claimed by Anna Weber');
    expect(c.counts().audit).toBe(before.audit + 1);
    expect(
      count("select count(*) n from audit_log where action='lead.assign' and entity_id = ?", id),
    ).toBe(1);
  });

  it('second claimer gets 409 ALREADY_ASSIGNED with the owner name', async () => {
    const id = pool();
    await svc.claim(user(EM.jonas), id);
    await expect(svc.claim(user(EM.anna), id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_ASSIGNED',
      ownerName: 'Jonas Fischer',
    });
  });

  it('refuses at the limit with 422 CLAIM_LIMIT; COLD leads do not count', async () => {
    const felix = user(EM.felix);
    const open = () =>
      count(`select count(*) n from leads where owner_id = ? and stage in ${OPEN}`, felix.id);
    setMax(EM.felix, open());
    await expect(svc.claim(felix, pool())).rejects.toMatchObject({
      statusCode: 422,
      code: 'CLAIM_LIMIT',
    });
    c.sqlite
      .prepare("update leads set stage='COLD' where owner_id = ? and stage='NEW'")
      .run(felix.id);
    setMax(EM.felix, open() + 1);
    await svc.claim(felix, pool());
    setMax(EM.felix, 25);
  });

  it('a lead in another team pool is invisible (404)', async () => {
    const id = c.createLead({ owner: null, team: 'South' });
    await expect(svc.claim(user(EM.anna), id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('SC-001: 50 parallel claims give exactly one success', async () => {
    const id = pool();
    const reps = [EM.anna, EM.jonas, EM.lea, EM.felix].map(user);
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => svc.claim(reps[i % 4]!, id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      count("select count(*) n from activities where lead_id = ? and type='CLAIMED'", id),
    ).toBe(1);
  });
});

describe('assign (US-2, US-4)', () => {
  it('manager assigns in team: activity, audit, follow-ups move, no-op on same owner', async () => {
    const id = c.createLead({ owner: EM.felix });
    const lea = user(EM.lea);
    c.sqlite
      .prepare(
        "insert into follow_ups (id, lead_id, assigned_to, due_at, status, created_at) values ('fu_' || ?, ?, ?, ?, 'PENDING', ?)",
      )
      .run(id, id, user(EM.felix).id, Date.now() + 1000, Date.now());
    const r = await svc.assign(user(EM.lukas), id, { toUserId: lea.id, reason: 'Holiday' });
    expect(r.changed).toBe(true);
    expect(lastNote(id)).toBe('Assigned to Lea Hoffmann by Lukas Becker');
    const meta = one<{ metadata: string }>(
      'select metadata from activities where lead_id = ? order by created_at desc, id desc limit 1',
      id,
    ).metadata;
    expect(JSON.parse(meta)).toMatchObject({ to: lea.id, method: 'MANUAL', reason: 'Holiday' });
    expect(
      one<{ assigned_to: string }>('select assigned_to from follow_ups where lead_id = ?', id)
        .assigned_to,
    ).toBe(lea.id);
    const n = c.counts();
    const again = await svc.assign(user(EM.lukas), id, { toUserId: lea.id });
    expect(again.changed).toBe(false);
    expect(c.counts()).toEqual(n);
  });

  it('RBAC: rep 403, cross-team manager 404/403, inactive 422, stale version 409', async () => {
    const id = c.createLead({ owner: EM.felix });
    const mine = c.createLead({ owner: EM.anna });
    const lea = user(EM.lea);
    await expect(svc.assign(user(EM.anna), id, { toUserId: lea.id })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(svc.assign(user(EM.anna), mine, { toUserId: lea.id })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      svc.assign(user(EM.marco), id, { toUserId: user(EM.sofia).id }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      svc.assign(user(EM.lukas), id, { toUserId: user(EM.sofia).id }),
    ).rejects.toMatchObject({ statusCode: 403 });
    c.sqlite.prepare('update users set is_active = 0 where id = ?').run(lea.id);
    await expect(svc.assign(user(EM.lukas), id, { toUserId: lea.id })).rejects.toMatchObject({
      code: 'TARGET_INACTIVE',
      statusCode: 422,
    });
    c.sqlite.prepare('update users set is_active = 1 where id = ?').run(lea.id);
    await expect(
      svc.assign(user(EM.lukas), id, { toUserId: lea.id, version: 1 }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('manager ignores the claim limit; unassign returns to pool', async () => {
    const id = c.createLead({ owner: EM.felix });
    setMax(EM.lea, 0);
    await svc.assign(user(EM.lukas), id, { toUserId: user(EM.lea).id });
    setMax(EM.lea, 25);
    const r = await svc.assign(user(EM.lukas), id, { toUserId: null });
    expect(r.lead.ownerId).toBeNull();
    expect(lastNote(id)).toBe('Returned to pool by Lukas Becker');
  });

  it('VP cross-team move updates team and notes it', async () => {
    const id = c.createLead({ owner: EM.felix });
    const sofia = user(EM.sofia);
    await svc.assign(user(EM.isabelle), id, { toUserId: sofia.id });
    const l = c.lead(id);
    expect(l.owner_id).toBe(sofia.id);
    expect(l.team_id).toBe(sofia.teamId);
    expect(lastNote(id)).toContain('Moved from Team DACH to Team South');
  });

  it('assignee picker: reps only, room first, then language match, scoped', async () => {
    const id = pool();
    const lukas = user(EM.lukas);
    const list = await svc.listAssignees(lukas, lukas.teamId!, id);
    expect(list).toHaveLength(4);
    for (const a of list) expect(a.atLimit).toBe(a.openLeads >= a.maxOpenLeads);
    const sorted = [...list].sort(
      (a, b) =>
        Number(a.atLimit) - Number(b.atLimit) ||
        Number(b.languageMatch) - Number(a.languageMatch) ||
        a.openLeads - b.openLeads ||
        a.name.localeCompare(b.name),
    );
    expect(list.map((a) => a.id)).toEqual(sorted.map((a) => a.id));
    await expect(svc.listAssignees(user(EM.anna), user(EM.anna).teamId!)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(svc.listAssignees(lukas, user(EM.sofia).teamId!)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('bulk (US-3)', () => {
  it('assigns 5 atomically with 5 activities', async () => {
    const ids = Array.from({ length: 5 }, () => c.createLead({ owner: EM.felix }));
    const before = count("select count(*) n from activities where type='ASSIGNED'");
    const r = await svc.bulkAssign(user(EM.lukas), { leadIds: ids, toUserId: user(EM.lea).id });
    expect(r.assigned).toBe(5);
    expect(count("select count(*) n from activities where type='ASSIGNED'")).toBe(before + 5);
  });

  it('all or nothing: an out-of-scope lead fails the lot and lists the offender', async () => {
    const good = c.createLead({ owner: EM.felix });
    const bad = c.createLead({ owner: EM.sofia });
    const before = c.counts();
    const err = await svc
      .bulkAssign(user(EM.lukas), { leadIds: [good, bad], toUserId: user(EM.lea).id })
      .catch((e) => e);
    expect(err).toMatchObject({ statusCode: 403, leadIds: [bad] });
    expect(c.counts()).toEqual(before);
    expect(c.lead(good).owner_id).toBe(user(EM.felix).id);
  });

  it('rejects more than 100 ids', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `x${i}`);
    await expect(
      svc.bulkAssign(user(EM.lukas), { leadIds: ids, toUserId: null }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('settings + auto-assign (US-5, US-6)', () => {
  const teamId = () => user(EM.lukas).teamId!;

  it('RBAC: rep 403, other-team manager 403, VP sees all teams, bad strategy refused', async () => {
    const { teamSettingsPatchSchema } = await import('@leaddesk/shared');
    const patch = { autoAssign: true, assignStrategy: 'ROUND_ROBIN' as const };
    await expect(svc.getTeamSettings(user(EM.anna))).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.updateTeamSettings(user(EM.marco), teamId(), patch)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(svc.updateTeamSettings(user(EM.anna), teamId(), patch)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(await svc.getTeamSettings(user(EM.isabelle))).toHaveLength(3);
    expect(await svc.getTeamSettings(user(EM.lukas))).toHaveLength(1);
    expect(
      teamSettingsPatchSchema.safeParse({ autoAssign: true, assignStrategy: 'NOPE' }).success,
    ).toBe(false);
  });

  it('off goes to pool; on with LANGUAGE_MATCH picks a speaker; audited', async () => {
    await svc.updateTeamSettings(user(EM.lukas), teamId(), {
      autoAssign: false,
      assignStrategy: 'LANGUAGE_MATCH',
    });
    const a = pool();
    expect(await svc.autoAssign(teamId(), a, 'de')).toEqual({
      assigned: false,
      reason: 'auto_assign_off',
    });
    await svc.updateTeamSettings(user(EM.lukas), teamId(), {
      autoAssign: true,
      assignStrategy: 'LANGUAGE_MATCH',
    });
    const r = await svc.autoAssign(teamId(), a, 'pl');
    expect(r).toMatchObject({ assigned: true, ownerId: user(EM.felix).id });
    expect(lastNote(a)).toMatch(
      /^Auto-assigned to Felix Wagner · language match: pl · \d+ open leads$/,
    );
    expect(count("select count(*) n from audit_log where action='team.settings.update'")).toBe(2);
  });

  it('inactive and full reps are skipped; all full goes to pool; none active goes to pool', async () => {
    await svc.updateTeamSettings(user(EM.lukas), teamId(), {
      autoAssign: true,
      assignStrategy: 'LOAD_BALANCED',
      reps: [{ id: user(EM.anna).id, isActive: false }],
    });
    for (let i = 0; i < 6; i++) {
      const r = await svc.autoAssign(teamId(), pool(), 'de');
      expect(r).toMatchObject({ assigned: true });
      if (r.assigned) expect(r.ownerId).not.toBe(user(EM.anna).id);
    }
    c.sqlite.prepare('update users set max_open_leads = 0 where team_id = ?').run(teamId());
    expect(await svc.autoAssign(teamId(), pool(), 'de')).toEqual({
      assigned: false,
      reason: 'all_at_capacity',
    });
    c.sqlite
      .prepare("update users set is_active = 0 where team_id = ? and role = 'REP'")
      .run(teamId());
    expect(await svc.autoAssign(teamId(), pool(), 'de')).toEqual({
      assigned: false,
      reason: 'no_active_reps',
    });
    c.sqlite
      .prepare(
        "update users set is_active = 1, max_open_leads = 500 where team_id = ? and role = 'REP'",
      )
      .run(teamId());
  });

  it('concurrent intakes do not double-pick the same least-loaded rep', async () => {
    const ids = Array.from({ length: 8 }, pool);
    await svc.updateTeamSettings(user(EM.lukas), teamId(), {
      autoAssign: true,
      assignStrategy: 'LOAD_BALANCED',
    });
    const before = await svc.getTeamSettings(user(EM.lukas));
    const res = await Promise.all(ids.map((id) => svc.autoAssign(teamId(), id, 'de')));
    expect(res.every((r) => r.assigned)).toBe(true);
    const after = await svc.getTeamSettings(user(EM.lukas));
    const deltas = after[0]!.reps.map(
      (r) => r.openLeads - before[0]!.reps.find((b) => b.id === r.id)!.openLeads,
    );
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(8);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    // Greedy least-loaded filling never widens the gap between reps.
    expect(spread(after[0]!.reps.map((r) => r.openLeads))).toBeLessThanOrEqual(
      Math.max(1, spread(before[0]!.reps.map((r) => r.openLeads))),
    );
    expect(deltas.some((d) => d > 0)).toBe(true);
  });

  it('rebalancePool assigns pool leads (team manager only)', async () => {
    const ids = [pool(), pool(), pool()];
    const r = await svc.rebalancePool(user(EM.lukas), teamId());
    expect(r.assigned).toBeGreaterThanOrEqual(3);
    for (const id of ids) expect(c.lead(id).owner_id).not.toBeNull();
    await expect(svc.rebalancePool(user(EM.marco), teamId())).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('publishes lead.assigned on every ownership change (SC-002 server side)', async () => {
    const { bus } = await import('@/server/events/bus');
    const seen: unknown[] = [];
    const off = bus.subscribe((e) => {
      if (e.type === 'lead.assigned') seen.push(e);
    });
    await svc.claim(user(EM.jonas), pool());
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'CLAIM', toOwnerId: user(EM.jonas).id });
  });
});

describe('HTTP', () => {
  it('claim route: 401 without session, 200 then 409 body with ownerName', async () => {
    const { POST } = await import('@/app/api/leads/[id]/claim/route');
    const { req } = await import('./auth/helpers');
    const id = pool();
    const call = (cookie?: string) =>
      POST(
        req(`/api/leads/${id}/claim`, {
          method: 'POST',
          body: {},
          cookie,
          headers: { host: 'localhost' },
        }) as never,
        { params: { id } },
      );
    expect((await call()).status).toBe(401);
    expect((await call(await c.login(EM.anna))).status).toBe(200);
    const r = await call(await c.login(EM.jonas));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatchObject({
      code: 'ALREADY_ASSIGNED',
      ownerName: 'Anna Weber',
    });
  });

  it('settings route: rep 403; bad strategy 400; manager 200', async () => {
    const { PATCH } = await import('@/app/api/teams/[id]/settings/route');
    const { req } = await import('./auth/helpers');
    const tid = user(EM.lukas).teamId!;
    const call = (cookie: string, body: unknown) =>
      PATCH(
        req(`/api/teams/${tid}/settings`, {
          method: 'PATCH',
          body,
          cookie,
          headers: { host: 'localhost' },
        }) as never,
        { params: { id: tid } },
      );
    const ok = { autoAssign: true, assignStrategy: 'ROUND_ROBIN' };
    expect((await call(await c.login(EM.anna), ok)).status).toBe(403);
    expect((await call(await c.login(EM.lukas), { ...ok, assignStrategy: 'X' })).status).toBe(400);
    expect((await call(await c.login(EM.lukas), ok)).status).toBe(200);
  });
});
