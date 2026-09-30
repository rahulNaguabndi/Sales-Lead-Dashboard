import { bus } from '@/server/events/bus';
import { resolveScope } from '@/server/policy/scope';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { createHub, type Hub } from './hub';
import type { FilterScope } from './filter';

async function loadScope(userId: string): Promise<FilterScope | null> {
  const row = db.select({ isActive: users.isActive }).from(users).where(eq(users.id, userId)).get();
  if (!row || !row.isActive) return null;
  try {
    const s = await resolveScope(userId);
    return { userIds: s.userIds, teamIds: s.teamIds, isVP: s.isOrgWide };
  } catch {
    return null;
  }
}

const g = globalThis as unknown as { __ldHub?: Hub };

/** One hub (and so one bus subscription) per process, surviving hot reload. */
export function getHub(): Hub {
  return (g.__ldHub ??= createHub({ bus, loadScope }));
}

export { loadScope };
