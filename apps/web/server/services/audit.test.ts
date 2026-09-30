import { beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import {
  auditFiltersSchema,
  decodeCursor,
  encodeCursor,
  queryAudit,
  summarize,
} from './audit';
import { EMAIL, setupActivityEnv, type Ctx } from '../../tests/integration/activity-helpers';
import { resolveScope } from '../policy';

describe('cursor codec', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor(1759240000000, 'abc123'))).toEqual({
      createdAt: 1759240000000,
      id: 'abc123',
    });
  });
  it('rejects malformed cursors', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('x|y').toString('base64url'))).toBeNull();
  });
});

describe('auditFiltersSchema', () => {
  it('defaults limit to 50 and caps at 100', () => {
    expect(auditFiltersSchema.parse({}).limit).toBe(50);
    expect(auditFiltersSchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(auditFiltersSchema.safeParse({ limit: '0' }).success).toBe(false);
  });
  it('rejects from > to, bad action and bad entity', () => {
    expect(auditFiltersSchema.safeParse({ from: 10, to: 5 }).success).toBe(false);
    expect(auditFiltersSchema.safeParse({ action: "lead'; drop" }).success).toBe(false);
    expect(auditFiltersSchema.safeParse({ entity: 'nope' }).success).toBe(false);
    expect(auditFiltersSchema.safeParse({ action: 'lead.*', entity: 'lead' }).success).toBe(true);
  });
});

describe('summarize', () => {
  it('owner change with method', () => {
    const s = summarize(
      {
        action: 'lead.assign',
        before: { ownerId: 'a' },
        after: { ownerId: 'b' },
        meta: { method: 'MANUAL' },
      },
      { ownerId: { a: 'Anna', b: 'Jonas' } },
    );
    expect(s).toBe('Owner: Anna → Jonas (manual)');
  });
  it('stage change, created and unknown fallback', () => {
    expect(summarize({ action: 'lead.stage', before: { stage: 'NEW' }, after: { stage: 'CONTACTED' } })).toBe(
      'Stage: NEW → CONTACTED',
    );
    expect(summarize({ action: 'lead.intake', before: null, after: {} })).toBe('Lead created');
    expect(summarize({ action: 'weird.thing', before: null, after: null })).toBe('weird.thing');
  });
});

let c: Ctx;
const ids: Record<string, string> = {};
const insert = (
  actor: string | null,
  action: string,
  entity: string,
  entityId: string,
  createdAt: number,
  extra: { before?: unknown; after?: unknown; meta?: unknown } = {},
) => {
  const id = ulid(createdAt);
  c.sqlite
    .prepare(
      `insert into audit_log (id, actor_id, action, entity, entity_id, before, after, meta, created_at)
       values (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      actor,
      action,
      entity,
      entityId,
      JSON.stringify(extra.before ?? null),
      JSON.stringify(extra.after ?? null),
      extra.meta ? JSON.stringify(extra.meta) : null,
      createdAt,
    );
  return id;
};

beforeAll(async () => {
  c = await setupActivityEnv();
  ids.dach = c.createLead({ owner: EMAIL.anna });
  ids.south = c.createLead({ owner: EMAIL.sofia });
  const base = Date.now() - 100_000;
  insert(c.userId(EMAIL.lukas), 'lead.assign', 'lead', ids.dach!, base, {
    before: { ownerId: c.userId(EMAIL.sofia) },
    after: { ownerId: c.userId(EMAIL.anna) },
    meta: { method: 'MANUAL' },
  });
  insert(c.userId(EMAIL.anna), 'lead.stage', 'lead', ids.dach!, base + 1, {
    before: { stage: 'NEW' },
    after: { stage: 'CONTACTED' },
  });
  insert(c.userId(EMAIL.sofia), 'lead.stage', 'lead', ids.south!, base + 2, {
    before: { stage: 'NEW' },
    after: { stage: 'CONTACTED' },
  });
  ids.offer = insert(c.userId(EMAIL.isabelle), 'offer.create', 'offer', 'offer-x', base + 3);
  insert(null, 'auth.login_failed', 'auth', 'x', base + 4, { meta: { emailHash: 'abc', actorType: 'SYSTEM' } });
  // equal created_at entries for keyset check
  for (let i = 0; i < 5; i++) insert(c.userId(EMAIL.lukas), 'lead.score', 'lead', ids.dach!, base + 50);
});

const scopeOf = (email: string) => resolveScope(c.userId(email));

describe('queryAudit', () => {
  it('lead trail with actor names and owner diff resolved', async () => {
    const r = queryAudit(await scopeOf(EMAIL.isabelle), { entity: 'lead', entityId: ids.dach, action: 'lead.assign' });
    expect(r.items).toHaveLength(1);
    const it = r.items[0]!;
    expect(it.actor).toMatchObject({ name: 'Lukas Becker' });
    expect(it.summary).toMatch(/^Owner: .* → .* \(manual\)$/);
    expect(it.entityLabel).toMatch(/^T-/);
  });

  it('REP is forbidden', async () => {
    expect(() => queryAudit(resolveScopeSync(), {})).toThrow();
  });

  it('keyset pagination has no gaps or duplicates across equal timestamps', async () => {
    const scope = await scopeOf(EMAIL.isabelle);
    const total = queryAudit(scope, { limit: 100 }).items.length;
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 100; i++) {
      const p = queryAudit(scope, { limit: 3, cursor });
      seen.push(...p.items.map((x) => x.id));
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(total);
  });

  it('prefix and exact action filters, date range', async () => {
    const scope = await scopeOf(EMAIL.isabelle);
    const pre = queryAudit(scope, { action: 'lead.*', limit: 100 }).items;
    expect(pre.length).toBeGreaterThan(0);
    expect(pre.every((i) => i.action.startsWith('lead.'))).toBe(true);
    expect(queryAudit(scope, { action: 'offer.create' }).items).toHaveLength(1);
    expect(queryAudit(scope, { from: Date.now() + 10_000 }).items).toHaveLength(0);
  });

  it('invalid cursor -> INVALID_FILTER', async () => {
    const scope = await scopeOf(EMAIL.isabelle);
    expect(() => queryAudit(scope, { cursor: 'zzz' })).toThrow(/Invalid audit filter/);
  });

  it('manager sees own team only, no offers; VP sees all', async () => {
    const lukas = queryAudit(await scopeOf(EMAIL.lukas), { limit: 100 }).items;
    expect(lukas.some((i) => i.entityId === ids.south)).toBe(false);
    expect(lukas.some((i) => i.entity === 'offer')).toBe(false);
    expect(lukas.some((i) => i.entityId === ids.dach)).toBe(true);
    const marco = queryAudit(await scopeOf(EMAIL.marco), { limit: 100 }).items;
    expect(marco.some((i) => i.entityId === ids.dach && i.actor && 'id' in i.actor && i.actor.name === 'Anna Weber')).toBe(false);
    const vp = queryAudit(await scopeOf(EMAIL.isabelle), { limit: 100 }).items;
    expect(vp.some((i) => i.entity === 'offer')).toBe(true);
  });

  it('system events render as non-user actor and carry no secrets', async () => {
    const r = queryAudit(await scopeOf(EMAIL.isabelle), { action: 'auth.login_failed' }).items[0]!;
    expect(r.actor).toEqual({ type: 'SYSTEM' });
    expect(JSON.stringify(r)).not.toMatch(/password/i);
  });
});

function resolveScopeSync() {
  return { userId: 'x', role: 'REP' as const, userIds: new Set<string>(), teamIds: new Set<string>(), isOrgWide: false };
}
