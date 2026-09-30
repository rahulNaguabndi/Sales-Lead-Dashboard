import { ulid } from 'ulid';
import type { Tx } from './repositories/base';
import { auditLog } from './schema';

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Inserts an audit row inside the caller's transaction (synchronous): if the transaction rolls
 * back, no audit row persists. audit_log is append-only at the database level.
 */
export function writeAudit(tx: Tx, entry: AuditEntry): void {
  tx.insert(auditLog)
    .values({
      id: ulid(),
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      meta: entry.meta ?? null,
      createdAt: Date.now(),
    })
    .run();
}
