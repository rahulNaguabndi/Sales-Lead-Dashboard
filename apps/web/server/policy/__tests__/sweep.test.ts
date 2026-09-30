import { beforeAll, describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { authorize } from '../authorize';
import { leadScopeWhere } from '../lead-filter';
import { resolveScope } from '../scope';
import type { Resource, Scope } from '../types';
import { leads } from '../../db/schema';
import { createFixture, type Fixture } from './fixtures';

let fx: Fixture;
const scopes: Record<string, Scope> = {};

beforeAll(async () => {
  fx = createFixture();
  for (const id of Object.keys(fx.users)) scopes[id] = await resolveScope(id, fx.db);
});

const LEAD_ACTIONS: Action[] = [
  'lead:read',
  'lead:write',
  'lead:claim',
  'lead:assign',
  'lead:reopen',
];

describe('sweep (SC-003): every lead x every persona', () => {
  it('lead:read succeeds iff the lead is in the SQL-visible set, else 404', async () => {
    for (const userId of Object.keys(fx.users)) {
      const visible = new Set(
        fx.db
          .select({ id: leads.id })
          .from(leads)
          .where(leadScopeWhere(scopes[userId]!))
          .all()
          .map((r) => r.id),
      );
      for (const l of Object.values(fx.leads)) {
        const resource: Resource = { kind: 'lead', lead: l };
        const result = authorize(fx.users[userId]!, 'lead:read', resource, {
          scope: scopes[userId],
          database: fx.db,
        });
        if (visible.has(l.id))
          await expect(result, `${userId}/${l.id}`).resolves.toEqual({ allowed: true });
        else await expect(result, `${userId}/${l.id}`).rejects.toMatchObject({ statusCode: 404 });
      }
    }
  });

  it('no lead action ever succeeds on an invisible lead (always 404)', async () => {
    for (const userId of Object.keys(fx.users)) {
      const visible = new Set(
        fx.db
          .select({ id: leads.id })
          .from(leads)
          .where(leadScopeWhere(scopes[userId]!))
          .all()
          .map((r) => r.id),
      );
      for (const l of Object.values(fx.leads).filter((x) => !visible.has(x.id))) {
        for (const action of LEAD_ACTIONS) {
          const resource: Resource = {
            kind: 'lead',
            lead: l,
            activityType: 'NOTE',
            targetUser: null,
          };
          await expect(
            authorize(fx.users[userId]!, action, resource, {
              scope: scopes[userId],
              database: fx.db,
            }),
            `${userId}/${l.id}/${action}`,
          ).rejects.toMatchObject({ statusCode: 404 });
        }
      }
    }
  });

  it('rep / manager / VP RBAC on a visible lead', async () => {
    const run = (u: string, a: Action, id: string, extra = {}) =>
      authorize(
        fx.users[u]!,
        a,
        { kind: 'lead', lead: fx.leads[id]!, ...extra },
        { scope: scopes[u], database: fx.db },
      );
    await expect(run('anna', 'lead:assign', 'L1', { targetUser: null })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(run('lukas', 'lead:assign', 'L1', { targetUser: null })).resolves.toBeTruthy();
    await expect(run('isabelle', 'lead:reopen', 'L9')).resolves.toBeTruthy();
    await expect(run('marco', 'lead:reopen', 'L9')).rejects.toMatchObject({ statusCode: 404 });
  });
});
