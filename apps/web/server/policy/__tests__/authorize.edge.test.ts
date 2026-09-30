import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Action } from '../actions';
import { authorize, can } from '../authorize';
import { resolveScope } from '../scope';
import type { Resource, Scope } from '../types';
import { addOpenLeads, createFixture, type Fixture } from './fixtures';

let fx: Fixture;
const scopes: Record<string, Scope> = {};

beforeAll(async () => {
  fx = createFixture();
  addOpenLeads(fx, 'jonas', 25);
  for (const id of Object.keys(fx.users)) scopes[id] = await resolveScope(id, fx.db);
});
afterEach(() => vi.restoreAllMocks());

const lead = (id: string, extra: Record<string, unknown> = {}): Resource =>
  ({ kind: 'lead', lead: fx.leads[id]!, ...extra }) as Resource;
const auth = (actor: string, action: Action, res?: Resource) =>
  authorize(fx.users[actor]!, action, res, { scope: scopes[actor], database: fx.db });
const target = (id: string, extra = {}) => ({
  id,
  teamId: fx.users[id]!.teamId,
  role: fx.users[id]!.role,
  isActive: true,
  ...extra,
});

describe('closed leads (FR-009)', () => {
  it.each(['lukas', 'isabelle'])('%s: non-NOTE write denied, NOTE allowed', async (actor) => {
    await expect(
      auth(actor, 'lead:write', lead('L5', { activityType: 'CALL' })),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth(actor, 'lead:write', lead('L5', { activityType: 'NOTE' }))).resolves.toEqual({
      allowed: true,
    });
  });

  it('VP: non-NOTE write on a LOST lead denied', async () => {
    await expect(
      auth('isabelle', 'lead:write', lead('L9', { activityType: 'CALL' })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rep NOTE on a closed lead they do not own is denied', async () => {
    await expect(
      auth('jonas', 'lead:write', lead('L5', { activityType: 'NOTE' })),
    ).rejects.toMatchObject({ statusCode: 404 }); // not visible
  });
});

describe('assign rules', () => {
  it('manager cannot assign to another manager, but can to self', async () => {
    const other = { id: 'claire', teamId: 'west', role: 'MANAGER' as const, isActive: true };
    await expect(
      auth('lukas', 'lead:assign', lead('L3', { targetUser: other })),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      auth('lukas', 'lead:assign', lead('L3', { targetUser: target('lukas') })),
    ).resolves.toEqual({ allowed: true });
  });

  it('manager cannot assign to a peer team rep; VP can (newTeamId)', async () => {
    await expect(
      auth('lukas', 'lead:assign', lead('L3', { targetUser: target('emile') })),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      auth('isabelle', 'lead:assign', lead('L3', { targetUser: target('emile') })),
    ).resolves.toEqual({ allowed: true, newTeamId: 'west' });
  });

  it('VP cannot assign to an inactive user; assign without a target is denied', async () => {
    await expect(
      auth(
        'isabelle',
        'lead:assign',
        lead('L3', { targetUser: target('felix', { isActive: false }) }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth('isabelle', 'lead:assign', lead('L3'))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('unassign (null target) allowed for manager and VP, not rep', async () => {
    await expect(
      auth('isabelle', 'lead:assign', lead('L1', { targetUser: null })),
    ).resolves.toEqual({ allowed: true });
    await expect(
      auth('anna', 'lead:assign', lead('L1', { targetUser: null })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('same-team assignment has no newTeamId', async () => {
    const r = await auth('lukas', 'lead:assign', lead('L3', { targetUser: target('lea') }));
    expect(r.newTeamId).toBeUndefined();
  });
});

describe('claim rules', () => {
  it('claiming an owned visible lead is denied', async () => {
    await expect(auth('lukas', 'lead:claim', lead('L1'))).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rep at the DB open-lead limit gets CLAIM_LIMIT_REACHED (count from DB)', async () => {
    await expect(auth('jonas', 'lead:claim', lead('L3'))).rejects.toMatchObject({
      code: 'CLAIM_LIMIT_REACHED',
    });
  });

  it('rep under the limit can claim from the DB count', async () => {
    await expect(auth('lea', 'lead:claim', lead('L3'))).resolves.toEqual({ allowed: true });
  });

  it('manager claims an unassigned visible lead', async () => {
    await expect(auth('lukas', 'lead:claim', lead('L3'))).resolves.toEqual({ allowed: true });
  });
});

describe('visibility and misc', () => {
  it('deactivated rep leads stay visible to their manager', async () => {
    await expect(auth('lukas', 'lead:read', lead('L6'))).resolves.toEqual({ allowed: true });
  });

  it('reopen denied for rep, allowed for manager', async () => {
    await expect(auth('anna', 'lead:reopen', lead('L5'))).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(auth('lukas', 'lead:reopen', lead('L5'))).resolves.toEqual({ allowed: true });
  });

  it('non-lead action with lead resource kind, and lead action without resource, are denied', async () => {
    await expect(auth('lukas', 'lead:read')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('team:read / dashboard:team honour team scope', async () => {
    const dach = { kind: 'team', team: { id: 'dach', managerId: 'lukas' } } as const;
    const south = { kind: 'team', team: { id: 'south', managerId: 'marco' } } as const;
    await expect(auth('anna', 'team:read', dach)).resolves.toBeTruthy();
    await expect(auth('anna', 'team:read', south)).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth('lukas', 'dashboard:team', south)).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth('isabelle', 'demographics:read', south)).resolves.toBeTruthy();
    await expect(auth('anna', 'demographics:read')).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth('anna', 'user:list')).rejects.toMatchObject({ statusCode: 403 });
    await expect(auth('lukas', 'user:list')).resolves.toBeTruthy();
  });

  it('can() returns booleans', async () => {
    expect(await can(fx.users.anna!, 'lead:read', lead('L1'), { scope: scopes.anna })).toBe(true);
    expect(await can(fx.users.anna!, 'lead:read', lead('L2'), { scope: scopes.anna })).toBe(false);
    expect(await can(fx.users.anna!, 'offer:manage', undefined, { scope: scopes.anna })).toBe(
      false,
    );
  });
});

describe('denial logging (FR-013)', () => {
  it('logs mutation denials without PII, but not read denials', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await auth('anna', 'lead:assign', lead('L1', { targetUser: null })).catch(() => {});
    expect(spy).toHaveBeenCalledOnce();
    const line = String(spy.mock.calls[0]![0]);
    expect(JSON.parse(line)).toMatchObject({
      level: 'warn',
      userId: 'anna',
      action: 'lead:assign',
      resourceId: 'L1',
    });
    expect(line).not.toContain('@');
    spy.mockClear();
    await auth('anna', 'dashboard:team').catch(() => {});
    await auth('anna', 'lead:read', lead('L2')).catch(() => {});
    expect(spy).not.toHaveBeenCalled();
  });
});
