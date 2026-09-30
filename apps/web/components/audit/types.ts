import type { AuditItem } from '@/server/services/audit';

/** JSON shape of GET /api/audit items (server type, serialised). */
export type AuditItemDto = AuditItem;
export type AuditPageDto = { items: AuditItemDto[]; nextCursor: string | null };

export type AuditFilterState = {
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  leadRef?: string;
};

export const FILTER_KEYS = ['from', 'to', 'actorId', 'action', 'entity', 'entityId', 'leadRef'] as const;
