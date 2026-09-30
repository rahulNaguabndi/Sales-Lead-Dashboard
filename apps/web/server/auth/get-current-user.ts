import { eq } from 'drizzle-orm';
import type { Role } from '@leaddesk/shared';
import { db } from '../db/client';
import { users } from '../db/schema';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
};

const STUB_EMAIL = 'isabelle.laurent@eurodrive.test';

/**
 * Returns the signed-in user. F01 ships a development stub that resolves the seeded VP so the
 * app shell is usable before authentication exists. F02 replaces this function BODY with real
 * JWT-cookie parsing; the signature must not change.
 */
export async function getCurrentUser(_req?: Request): Promise<CurrentUser | null> {
  try {
    const row = db.select().from(users).where(eq(users.email, STUB_EMAIL)).get();
    if (row) {
      return { id: row.id, name: row.name, email: row.email, role: row.role, teamId: row.teamId };
    }
  } catch {
    // Database not created yet (db:reset not run): fall through to the hardcoded stub.
  }
  return { id: 'stub-vp', name: 'Isabelle Laurent', email: STUB_EMAIL, role: 'VP', teamId: null };
}
