import { sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { db } from '@/server/db/client';

/** Test helper: asserts that exactly-at-least one audit entry exists for (action, entityId). */
export function expectAudited(action: string, entityId: string) {
  const rows = db.all<{ id: string }>(
    sql`SELECT id FROM audit_log WHERE action = ${action} AND entity_id = ${entityId}`,
  );
  expect(rows.length, `expected audit entry ${action} for ${entityId}`).toBeGreaterThan(0);
  return rows;
}
