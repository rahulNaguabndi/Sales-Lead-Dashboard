import { ulid } from 'ulid';
import { createFixture, type Fixture } from '@/server/policy/__tests__/fixtures';

export type DetailFixture = Fixture & { ids: Record<string, string> };

/** The policy fixture with ULID-keyed leads (F05 validates the id format) plus one customer history. */
export function createDetailFixture(): DetailFixture {
  const fx = createFixture();
  const ids: Record<string, string> = {};
  for (const key of Object.keys(fx.leads)) {
    const id = ulid();
    ids[key] = id;
    fx.sqlite.prepare('UPDATE leads SET id = ? WHERE id = ?').run(id, key);
  }
  return { ...fx, ids };
}

export function addActivity(
  fx: Fixture,
  leadId: string,
  a: {
    id?: string;
    kind?: 'USER' | 'SYSTEM';
    type?: string;
    actorId?: string | null;
    note?: string;
    createdAt: number;
    metadata?: unknown;
  },
): string {
  const id = a.id ?? ulid();
  fx.sqlite
    .prepare(
      `INSERT INTO activities (id, lead_id, actor_id, kind, type, outcome, note, ai_assisted, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
    )
    .run(
      id,
      leadId,
      a.actorId ?? null,
      a.kind ?? 'USER',
      a.type ?? 'NOTE',
      a.note ?? 'x',
      a.metadata ? JSON.stringify(a.metadata) : null,
      a.createdAt,
    );
  return id;
}
