import { z } from 'zod';
import type { LeadDeskEvent } from '@leaddesk/shared';

const base = { at: z.number(), by: z.string().nullable() };
const scoped = { ...base, teamId: z.string(), ownerId: z.string().nullable() };

const schema = z.discriminatedUnion('type', [
  z.object({ ...scoped, type: z.literal('lead.created'), lead: z.object({ id: z.string() }).passthrough() }),
  z.object({
    ...scoped, type: z.literal('lead.assigned'), leadId: z.string(),
    fromOwnerId: z.string().nullable(), toOwnerId: z.string().nullable(),
    method: z.enum(['AUTO', 'MANUAL', 'CLAIM']),
  }),
  z.object({ ...scoped, type: z.literal('lead.updated'), leadId: z.string(), changes: z.record(z.unknown()) }),
  z.object({ ...scoped, type: z.literal('activity.created'), leadId: z.string(), activity: z.object({ id: z.string() }).passthrough() }),
  z.object({ ...scoped, type: z.literal('followup.due'), followUpId: z.string(), leadId: z.string(), dueAt: z.number() }),
  z.object({ ...base, type: z.literal('offer.changed'), offerId: z.string(), teamId: z.null(), ownerId: z.null() }),
]);

export function isValidEvent(e: unknown): e is LeadDeskEvent {
  return schema.safeParse(e).success;
}
