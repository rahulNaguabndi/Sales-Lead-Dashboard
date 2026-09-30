import { beforeAll, describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { authorize } from '../authorize';
import { resolveScope } from '../scope';
import type { Resource, Scope } from '../types';
import { AppError } from '../../http/errors';
import { addOpenLeads, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
const scopes: Record<string, Scope> = {};

beforeAll(async () => {
  fx = createFixture();
  addOpenLeads(fx, 'jonas', 0);
  for (const id of Object.keys(fx.users)) scopes[id] = await resolveScope(id, fx.db);
});

type Outcome = { status: number; code?: string; newTeamId?: string; message?: string };

async function run(actor: string, action: Action, resource?: Resource): Promise<Outcome> {
  try {
    const r = await authorize(fx.users[actor]!, action, resource, {
      scope: scopes[actor],
      database: fx.db,
    });
    return { status: 200, newTeamId: r.newTeamId };
  } catch (err) {
    if (err instanceof AppError)
      return { status: err.statusCode, code: err.code, message: err.message };
    throw err;
  }
}

const lead = (id: string, extra: Partial<Extract<Resource, { kind: 'lead' }>> = {}): Resource => ({
  kind: 'lead',
  lead: fx.leads[id]!,
  ...extra,
});
const team = (id: string, managerId: string): Resource => ({
  kind: 'team',
  team: { id, managerId },
});
const target = (id: string) => {
  const u = fx.users[id]!;
  return { id, teamId: u.teamId, role: u.role, isActive: id !== 'felix' };
};

type Row = [
  n: number,
  actor: string,
  action: Action,
  res: () => Resource | undefined,
  expected: Partial<Outcome>,
];
const OK = { status: 200 };

const ROWS: Row[] = [
  [1, 'anna', 'lead:read', () => lead('L1'), OK],
  [2, 'anna', 'lead:read', () => lead('L2'), { status: 404 }],
  [3, 'anna', 'lead:read', () => lead('L3'), OK],
  [4, 'anna', 'lead:read', () => lead('L4'), { status: 404 }],
  [5, 'anna', 'lead:write', () => lead('L1'), OK],
  [6, 'anna', 'lead:write', () => lead('L3'), { status: 403 }],
  [7, 'anna', 'lead:write', () => lead('L5', { activityType: 'CALL' }), { status: 403 }],
  [8, 'anna', 'lead:write', () => lead('L5', { activityType: 'NOTE' }), OK],
  [9, 'anna', 'lead:claim', () => lead('L3', { openLeadCount: 10 }), OK],
  [
    10,
    'anna',
    'lead:claim',
    () => lead('L3', { openLeadCount: 25 }),
    { status: 403, code: 'CLAIM_LIMIT_REACHED' },
  ],
  [11, 'anna', 'lead:claim', () => lead('L4'), { status: 404 }],
  [12, 'anna', 'lead:assign', () => lead('L1', { targetUser: target('jonas') }), { status: 403 }],
  [13, 'anna', 'lead:reopen', () => lead('L5'), { status: 403 }],
  [14, 'anna', 'dashboard:team', () => undefined, { status: 403 }],
  [15, 'anna', 'offer:manage', () => undefined, { status: 403 }],
  [16, 'lukas', 'lead:read', () => lead('L1'), OK],
  [16, 'lukas', 'lead:read', () => lead('L3'), OK],
  [17, 'lukas', 'lead:read', () => lead('L2'), { status: 404 }],
  [18, 'lukas', 'lead:write', () => lead('L1'), OK],
  [19, 'lukas', 'lead:assign', () => lead('L3', { targetUser: target('lea') }), OK],
  [20, 'lukas', 'lead:assign', () => lead('L1', { targetUser: target('sofia') }), { status: 403 }],
  [21, 'lukas', 'lead:assign', () => lead('L1', { targetUser: target('felix') }), { status: 403 }],
  [22, 'lukas', 'lead:assign', () => lead('L1', { targetUser: null }), OK],
  [23, 'lukas', 'lead:reopen', () => lead('L5'), OK],
  [24, 'lukas', 'team:settings', () => team('dach', 'lukas'), OK],
  [25, 'lukas', 'team:settings', () => team('south', 'marco'), { status: 403 }],
  [26, 'lukas', 'dashboard:team', () => undefined, OK],
  [27, 'lukas', 'dashboard:org', () => undefined, { status: 403 }],
  [28, 'lukas', 'audit:read', () => undefined, OK],
  [29, 'isabelle', 'lead:read', () => lead('L1'), OK],
  [29, 'isabelle', 'lead:read', () => lead('L2'), OK],
  [29, 'isabelle', 'lead:read', () => lead('L3'), OK],
  [29, 'isabelle', 'lead:read', () => lead('L4'), OK],
  [
    30,
    'isabelle',
    'lead:assign',
    () => lead('L1', { targetUser: target('sofia') }),
    { status: 200, newTeamId: 'south' },
  ],
  [31, 'isabelle', 'team:settings', () => team('south', 'marco'), OK],
  [32, 'isabelle', 'dashboard:org', () => undefined, OK],
  [33, 'isabelle', 'offer:manage', () => undefined, OK],
  [34, 'marco', 'lead:read', () => lead('L1'), { status: 404 }],
  [35, 'sofia', 'offer:read', () => undefined, OK],
];

describe('authorize: test matrix (F03 §9, row 36 lives in scope.test.ts)', () => {
  it.each(ROWS.map((r) => [`row ${r[0]}: ${r[1]} ${r[2]}`, r] as const))(
    '%s',
    async (_name, row) => {
      const [, actor, action, res, expected] = row;
      const out = await run(actor, action, res());
      expect(out.status).toBe(expected.status);
      if (expected.code) expect(out.code).toBe(expected.code);
      if (expected.newTeamId) expect(out.newTeamId).toBe(expected.newTeamId);
      if (expected.status === 403 && !expected.code) expect(out.code).toBe('FORBIDDEN');
      if (expected.status === 404) expect(out.code).toBe('NOT_FOUND');
    },
  );

  it('row 10: CLAIM_LIMIT_REACHED message includes the limit', async () => {
    const out = await run('anna', 'lead:claim', lead('L3', { openLeadCount: 25 }));
    expect(out.message).toContain('25');
  });
});
