import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db as defaultDb, type Db } from '../db/client';
import { AppError, ForbiddenError } from '../http/errors';
import type { Scope } from '../policy';
import { activityTypeLabel, humanize, stageLabel } from '@leaddesk/shared';

export class InvalidFilterError extends AppError {
  readonly statusCode = 400;
  readonly code = 'INVALID_FILTER';
  constructor() {
    super('Invalid audit filter');
  }
}

export const AUDIT_ENTITIES = [
  'lead',
  'activity',
  'follow_up',
  'offer',
  'customer',
  'team',
  'user',
  'auth',
] as const;

const ACTION_PATTERN = /^[a-z_]+(\.[a-z_]+)*(\.\*)?$/;

export const auditFiltersSchema = z
  .object({
    from: z.coerce.number().int().nonnegative().optional(),
    to: z.coerce.number().int().nonnegative().optional(),
    actorId: z.string().min(1).max(64).optional(),
    action: z.string().max(64).regex(ACTION_PATTERN).optional(),
    entity: z.enum(AUDIT_ENTITIES).optional(),
    entityId: z.string().min(1).max(64).optional(),
    leadRef: z.string().min(1).max(64).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((f) => f.from === undefined || f.to === undefined || f.from <= f.to, {
    message: 'from must be before to',
    path: ['from'],
  });

export type AuditFilters = z.infer<typeof auditFiltersSchema>;

// ---- cursor codec ----------------------------------------------------------------------------

export function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

/** Returns null for anything that is not `<int>|<id>`. */
export function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const m = /^(\d{1,16})\|([A-Za-z0-9_-]{1,64})$/.exec(raw);
  return m ? { createdAt: Number(m[1]), id: m[2]! } : null;
}

// ---- pure helpers ----------------------------------------------------------------------------

export type AuditActor =
  { id: string; name: string; role: string } | { type: 'SYSTEM' | 'INTAKE' | 'JOB' };

export type AuditItem = {
  id: string;
  createdAt: number;
  actor: AuditActor;
  action: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  before: unknown;
  after: unknown;
  meta: Record<string, unknown> | null;
  resolved: Record<string, Record<string, string>>;
};

type SummaryInput = {
  action: string;
  before: unknown;
  after: unknown;
  meta?: Record<string, unknown> | null;
};

const REF_KEYS = ['ownerId', 'owner_id', 'assignedTo', 'assigned_to'] as const;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** "assignStrategy" / "owner_id" → "assign strategy" / "owner id". */
const fieldName = (k: string): string =>
  k
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`)
    .toLowerCase();

function refKey(o: Record<string, unknown>): string | undefined {
  return REF_KEYS.find((k) => k in o);
}

export function summarize(
  entry: SummaryInput,
  resolved: Record<string, Record<string, string>> = {},
): string {
  const before = obj(entry.before);
  const after = obj(entry.after);
  const name = (key: string, v: unknown) =>
    v === null || v === undefined ? 'Unassigned' : (resolved[key]?.[String(v)] ?? String(v));

  switch (entry.action) {
    case 'lead.assign':
    case 'lead.assigned': {
      const key = refKey(after) ?? refKey(before) ?? 'ownerId';
      const method = entry.meta?.method ? ` (${String(entry.meta.method).toLowerCase()})` : '';
      return `Owner: ${name(key, before[key])} → ${name(key, after[key])}${method}`;
    }
    case 'lead.stage':
    case 'lead.stage_change':
    case 'lead.auto_cold':
      return `Stage: ${stageLabel(before.stage as string | undefined)} → ${stageLabel(after.stage as string | undefined)}${entry.action === 'lead.auto_cold' ? ' (no response)' : ''}`;
    case 'lead.intake':
    case 'lead.created':
      return 'Lead created';
    case 'activity.create':
      return `Activity logged${entry.meta?.type ? `: ${activityTypeLabel(String(entry.meta.type))}` : ''}`;
    case 'auth.login':
      return 'Signed in';
    case 'auth.logout':
      return 'Signed out';
    case 'auth.login_failed':
      return 'Failed sign-in attempt';
    default: {
      const keys = Object.keys(after).filter(
        (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
      );
      const what = humanize(entry.action.replace(/\./g, ' ').replace(/_/g, ' '));
      if (keys.length) return `${what}: changed ${keys.map(fieldName).join(', ')}`;
      return what;
    }
  }
}

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** Batch-resolves user names referenced by owner-like keys: one query per call. */
export function resolveRefs(
  entries: { before: unknown; after: unknown }[],
  database: Db = defaultDb,
): Record<string, Record<string, string>>[] {
  const ids = new Set<string>();
  for (const e of entries)
    for (const side of [obj(e.before), obj(e.after)])
      for (const k of REF_KEYS) if (typeof side[k] === 'string') ids.add(side[k] as string);
  const names = new Map<string, string>();
  if (ids.size) {
    const rows = database.all<{ id: string; name: string }>(
      sql`SELECT id, name FROM users WHERE id IN (${sql.join(
        [...ids].map((i) => sql`${i}`),
        sql`, `,
      )})`,
    );
    for (const r of rows) names.set(r.id, r.name);
  }
  return entries.map((e) => {
    const out: Record<string, Record<string, string>> = {};
    for (const side of [obj(e.before), obj(e.after)])
      for (const k of REF_KEYS) {
        const v = side[k];
        if (typeof v === 'string' && names.has(v)) (out[k] ??= {})[v] = names.get(v)!;
      }
    return out;
  });
}

// ---- scope -----------------------------------------------------------------------------------

function inList(values: Iterable<string>): SQL {
  const list = [...values];
  return list.length
    ? sql.join(
        list.map((v) => sql`${v}`),
        sql`, `,
      )
    : sql`NULL`;
}

/** VP: unrestricted (null). MANAGER: team/subtree only. REP must be rejected by authorize first. */
export function buildScope(scope: Scope): SQL | null {
  if (!['MANAGER', 'VP'].includes(scope.role)) throw new ForbiddenError();
  if (scope.isOrgWide) return null;
  return sql`(al.entity <> 'offer' AND (
    l.team_id IN (${inList(scope.teamIds)})
    OR al.actor_id IN (${inList(scope.userIds)})
    OR (al.entity = 'team' AND al.entity_id IN (${inList(scope.teamIds)}))
    OR al.actor_id = ${scope.userId}
  ))`;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ---- query -----------------------------------------------------------------------------------

type Row = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  meta: unknown;
  created_at: number;
  actor_name: string | null;
  actor_role: string | null;
  lead_ref: string | null;
  cust_first: string | null;
  cust_last: string | null;
  offer_title: string | null;
  entity_user: string | null;
  entity_team: string | null;
};

const ACTOR_TYPES = new Set(['SYSTEM', 'INTAKE', 'JOB']);

export function queryAudit(
  scope: Scope,
  rawFilters: unknown,
  database: Db = defaultDb,
): { items: AuditItem[]; nextCursor: string | null } {
  const parsed = auditFiltersSchema.safeParse(rawFilters ?? {});
  if (!parsed.success) throw new InvalidFilterError();
  const f = parsed.data;
  const conds: SQL[] = [];
  const scopeCond = buildScope(scope);
  if (scopeCond) conds.push(scopeCond);

  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    if (!c) throw new InvalidFilterError();
    conds.push(
      sql`(al.created_at < ${c.createdAt} OR (al.created_at = ${c.createdAt} AND al.id < ${c.id}))`,
    );
  }
  if (f.from !== undefined) conds.push(sql`al.created_at >= ${f.from}`);
  if (f.to !== undefined) conds.push(sql`al.created_at <= ${f.to}`);
  if (f.actorId) conds.push(sql`al.actor_id = ${f.actorId}`);
  if (f.entity) conds.push(sql`al.entity = ${f.entity}`);
  if (f.entityId) conds.push(sql`al.entity_id = ${f.entityId}`);
  if (f.action) {
    if (f.action.endsWith('.*'))
      conds.push(sql`al.action LIKE ${escapeLike(f.action.slice(0, -1)) + '%'} ESCAPE '\\'`);
    else conds.push(sql`al.action = ${f.action}`);
  }
  if (f.leadRef) {
    conds.push(
      sql`(al.entity = 'lead' AND al.entity_id IN (SELECT id FROM leads WHERE reference = ${f.leadRef}))`,
    );
  }

  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const rows = database.all<Row>(sql`
    SELECT al.id, al.actor_id, al.action, al.entity, al.entity_id, al.before, al.after, al.meta,
           al.created_at, u.name AS actor_name, u.role AS actor_role, l.reference AS lead_ref,
           c.first_name AS cust_first, c.last_name AS cust_last, o.title AS offer_title,
           eu.name AS entity_user, et.name AS entity_team
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    LEFT JOIN leads l ON al.entity = 'lead' AND l.id = al.entity_id
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN offers o ON al.entity = 'offer' AND o.id = al.entity_id
    LEFT JOIN users eu ON al.entity IN ('user', 'auth') AND eu.id = al.entity_id
    LEFT JOIN teams et ON al.entity = 'team' AND et.id = al.entity_id
    ${where}
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT ${f.limit + 1}
  `);

  const hasMore = rows.length > f.limit;
  const page = hasMore ? rows.slice(0, f.limit) : rows;
  const parsedRows = page.map((r) => ({
    r,
    before: parseJson(r.before),
    after: parseJson(r.after),
    meta: obj(parseJson(r.meta)),
  }));
  const refs = resolveRefs(parsedRows, database);

  const items = parsedRows.map(({ r, before, after, meta }, i): AuditItem => {
    let actor: AuditActor;
    if (r.actor_id && r.actor_name)
      actor = { id: r.actor_id, name: r.actor_name, role: r.actor_role ?? '' };
    else {
      const t = String(meta.actorType ?? 'SYSTEM');
      actor = { type: (ACTOR_TYPES.has(t) ? t : 'SYSTEM') as 'SYSTEM' | 'INTAKE' | 'JOB' };
    }
    const entityLabel =
      r.lead_ref != null
        ? `${r.lead_ref}${r.cust_first ? ` · ${r.cust_first} ${r.cust_last ?? ''}`.trimEnd() : ''}`
        : (r.offer_title ??
          r.entity_user ??
          r.entity_team ??
          // Never show a raw ULID: name the kind of record instead.
          humanize(r.entity));
    return {
      id: r.id,
      createdAt: r.created_at,
      actor,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      entityLabel,
      summary: summarize({ action: r.action, before, after, meta }, refs[i]),
      before,
      after,
      meta: Object.keys(meta).length ? meta : null,
      resolved: refs[i]!,
    };
  });

  const last = page[page.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null };
}
