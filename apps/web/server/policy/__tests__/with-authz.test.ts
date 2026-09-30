import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../../http/errors';
import { withAuthz, type AuthzContext } from '../with-authz';
import type { CurrentUser, Resource } from '../types';

// Scope resolution hits the DB; stub it so this file tests only the wrapper's flow.
vi.mock('../scope', () => ({
  getScope: async (userId: string) => ({
    userId,
    role: userId === 'anna' ? 'REP' : 'VP',
    userIds: new Set([userId]),
    teamIds: new Set(['dach']),
    isOrgWide: userId !== 'anna',
  }),
}));

const anna: CurrentUser = {
  id: 'anna',
  name: 'Anna',
  email: 'a@x.test',
  role: 'REP',
  teamId: 'dach',
};
const req = new Request('http://localhost/api/leads/L1');
const ok = async () => Response.json({ ok: true });

const leadRes = (ownerId: string | null, teamId = 'dach'): Resource => ({
  kind: 'lead',
  lead: { id: 'L1', ownerId, teamId, stage: 'NEW' },
});

describe('withAuthz', () => {
  it('passes { user, scope, resource, req, params } to the handler', async () => {
    const handler = vi.fn(async (_ctx: AuthzContext<{ id: string }>) =>
      Response.json({ ok: true }),
    );
    const route = withAuthz<{ id: string }>(handler, {
      action: 'lead:read',
      resolveUser: async () => anna,
      loadResource: async () => leadRes('anna'),
    });
    const res = await route(req, { params: { id: 'L1' } });
    expect(res.status).toBe(200);
    const ctx = handler.mock.calls[0]![0];
    expect(ctx.user).toBe(anna);
    expect(ctx.params).toEqual({ id: 'L1' });
    expect(ctx.scope.userId).toBe('anna');
    expect(ctx.resource?.kind).toBe('lead');
    expect(ctx.req).toBe(req);
  });

  it('401 when the resolver throws UnauthorizedError', async () => {
    const route = withAuthz(ok, {
      action: 'offer:read',
      resolveUser: async () => {
        throw new UnauthorizedError();
      },
    });
    const res = await route(req, { params: {} });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('404 for an out-of-scope lead, handler not called', async () => {
    const handler = vi.fn(ok);
    const route = withAuthz(handler, {
      action: 'lead:read',
      resolveUser: async () => anna,
      loadResource: async () => leadRes('someone-else', 'south'),
    });
    expect((await route(req, { params: {} })).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('403 for a forbidden action on a visible lead', async () => {
    const route = withAuthz(ok, {
      action: 'lead:assign',
      resolveUser: async () => anna,
      loadResource: async () => leadRes('anna'),
    });
    const res = await route(req, { params: {} });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  });

  it('404 when the loader finds nothing', async () => {
    const route = withAuthz(ok, {
      action: 'lead:read',
      resolveUser: async () => anna,
      loadResource: async () => undefined,
    });
    expect((await route(req, { params: {} })).status).toBe(404);
  });

  it('500 without a stack for unknown errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = withAuthz(
      async () => {
        throw new Error('boom');
      },
      { action: 'offer:read', resolveUser: async () => anna },
    );
    const res = await route(req, { params: {} });
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('boom');
    expect(text).not.toContain('at ');
  });
});
