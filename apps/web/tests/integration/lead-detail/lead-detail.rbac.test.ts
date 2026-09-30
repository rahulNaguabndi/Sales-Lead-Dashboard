import { afterEach, describe, expect, it, vi } from 'vitest';
import { ulid } from 'ulid';
import { toErrorResponse } from '@/server/http/errors';
import { getLeadDetail, listActivities } from '@/server/services/lead-detail';
import { createDetailFixture } from './helpers';

afterEach(() => vi.restoreAllMocks());

type Case = { who: string; lead: string; visible: boolean };
const CASES: Case[] = [
  { who: 'anna', lead: 'L1', visible: true }, // rep, own lead
  { who: 'anna', lead: 'L2', visible: false }, // rep, other team's lead
  { who: 'anna', lead: 'L3', visible: true }, // rep, unassigned pool lead of own team
  { who: 'anna', lead: 'L4', visible: false }, // rep, other team's pool lead
  { who: 'lukas', lead: 'L1', visible: true }, // manager, report's lead
  { who: 'lukas', lead: 'L2', visible: false }, // manager, other team
  { who: 'isabelle', lead: 'L2', visible: true }, // VP, everything
  { who: 'isabelle', lead: 'L9', visible: true },
];

describe('F05 RBAC', () => {
  for (const c of CASES) {
    it(`${c.who} ${c.visible ? 'can' : 'cannot'} read ${c.lead} (detail and activities)`, async () => {
      const fx = createDetailFixture();
      const user = fx.users[c.who]!;
      const id = fx.ids[c.lead]!;
      const detail = getLeadDetail(user, id, { database: fx.db });
      const acts = listActivities(user, id, {}, { database: fx.db });
      if (c.visible) {
        await expect(detail).resolves.toBeTruthy();
        await expect(acts).resolves.toBeTruthy();
      } else {
        await expect(detail).rejects.toMatchObject({ statusCode: 404 });
        await expect(acts).rejects.toMatchObject({ statusCode: 404 });
      }
    });
  }

  it('out-of-scope and missing ids produce byte-identical 404 bodies', async () => {
    const fx = createDetailFixture();
    const errOf = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return JSON.stringify(toErrorResponse(e));
      }
      throw new Error('expected rejection');
    };
    const out = await errOf(getLeadDetail(fx.users.anna!, fx.ids.L2!, { database: fx.db }));
    const missing = await errOf(getLeadDetail(fx.users.anna!, ulid(), { database: fx.db }));
    const malformed = await errOf(getLeadDetail(fx.users.anna!, 'nope', { database: fx.db }));
    expect(out).toBe(missing);
    expect(out).toBe(malformed);
    expect(JSON.parse(out).status).toBe(404);
  });

  it('malformed id is rejected without touching the database', async () => {
    const database = new Proxy(
      {},
      {
        get() {
          throw new Error('database must not be queried');
        },
      },
    );
    await expect(
      getLeadDetail(createDetailFixture().users.anna!, '../etc/passwd', {
        database: database as never,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('logs out-of-scope attempts with userId and leadId only', async () => {
    const fx = createDetailFixture();
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await getLeadDetail(fx.users.anna!, fx.ids.L2!, { database: fx.db }).catch(() => undefined);
    const lines = write.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('lead read denied'));
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toEqual({
      level: 'warn',
      message: 'lead read denied',
      userId: 'anna',
      leadId: fx.ids.L2,
    });
  });

  it('permissions per role', async () => {
    const fx = createDetailFixture();
    const p = async (who: string, lead: string) =>
      (await getLeadDetail(fx.users[who]!, fx.ids[lead]!, { database: fx.db })).permissions;
    expect(await p('anna', 'L1')).toEqual({
      canRead: true,
      canLogActivity: true,
      canChangeStage: true,
      canAssign: false,
      canClaim: false,
    });
    expect(await p('lukas', 'L1')).toMatchObject({ canAssign: true, canLogActivity: true });
    // Unassigned pool lead: rep may claim but not log activities yet.
    expect(await p('anna', 'L3')).toMatchObject({ canClaim: true, canLogActivity: false });
    // Closed lead: rep owner can still add notes but not change the stage.
    expect(await p('anna', 'L5')).toMatchObject({ canLogActivity: true, canChangeStage: false });
  });
});
