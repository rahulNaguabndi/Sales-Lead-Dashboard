import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { leads } from '@/server/db/schema';
import { ValidationError } from '@/server/http/errors';
import type { Resource } from '@/server/policy';
import type { ZodType } from 'zod';

/** lead:read resource loader shared by the three AI routes. */
export async function loadLead({ id }: { id: string }): Promise<Resource | undefined> {
  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  return lead ? { kind: 'lead', lead } : undefined;
}

/** Parses an optional JSON body; an empty body counts as `{}`. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ValidationError('Request body must be JSON');
    }
  }
  return schema.parse(raw);
}
