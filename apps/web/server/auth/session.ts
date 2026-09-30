import { cache } from 'react';
import { eq } from 'drizzle-orm';
import type { Role } from '@leaddesk/shared';
import { db } from '../db/client';
import { users } from '../db/schema';
import { getRedis, redisStatus } from '../redis/client';
import { UnauthenticatedError } from './errors';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './constants';
import { verifySession, type SessionClaims } from './jwt';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
};

const REVOKED_PREFIX = 'auth:revoked:';
// Process-local denylist so logout still works for this instance when Redis is down.
const localRevoked = new Map<string, number>();

function warnDegraded(what: string) {
  console.warn(`[auth] Redis degraded: ${what}`);
}

export async function revokeJti(jti: string, exp: number, now = Date.now()): Promise<void> {
  const ttl = Math.max(1, exp - Math.floor(now / 1000));
  localRevoked.set(jti, exp * 1000);
  if (redisStatus() !== 'connected') return warnDegraded('revocation stored in-process only');
  try {
    await getRedis().set(`${REVOKED_PREFIX}${jti}`, '1', 'EX', ttl);
  } catch {
    warnDegraded('revocation stored in-process only');
  }
}

export async function isRevoked(jti: string, now = Date.now()): Promise<boolean> {
  const localExp = localRevoked.get(jti);
  if (localExp !== undefined) {
    if (localExp > now) return true;
    localRevoked.delete(jti);
  }
  if (redisStatus() !== 'connected') {
    warnDegraded('revocation check skipped');
    return false;
  }
  try {
    return (await getRedis().exists(`${REVOKED_PREFIX}${jti}`)) === 1;
  } catch {
    warnDegraded('revocation check skipped');
    return false;
  }
}

/** Loads the user for a verified token and applies the DB-backed checks. */
export async function userFromClaims(claims: SessionClaims): Promise<CurrentUser | null> {
  if (await isRevoked(claims.jti)) return null;
  const row = db.select().from(users).where(eq(users.id, claims.sub)).get();
  if (!row || !row.isActive || row.tokenVersion !== claims.tv) return null;
  // Role and team always come from the database, never from the token.
  return { id: row.id, name: row.name, email: row.email, role: row.role, teamId: row.teamId };
}

export async function getSessionUser(token: string | undefined | null) {
  const claims = await verifySession(token);
  return claims ? userFromClaims(claims) : null;
}

function cookieFromHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

async function resolveToken(req?: Request): Promise<string | undefined> {
  if (req) return cookieFromHeader(req.headers.get('cookie'), SESSION_COOKIE);
  const { cookies } = await import('next/headers');
  return cookies().get(SESSION_COOKIE)?.value;
}

// React's `cache` only exists under the server-component build; fall back to no memoization elsewhere.
const memoize: <T>(fn: () => Promise<T>) => () => Promise<T> =
  typeof cache === 'function' ? cache : (fn) => fn;
const loadFromRequestScope = memoize(async () => getSessionUser(await resolveToken()));

/** The signed-in user or null. Memoized per server request when no Request is passed. */
export async function getCurrentUser(req?: Request): Promise<CurrentUser | null> {
  if (req) return getSessionUser(await resolveToken(req));
  try {
    return await loadFromRequestScope();
  } catch {
    return null; // called outside a request scope
  }
}

export async function requireUser(req?: Request): Promise<CurrentUser> {
  const user = await getCurrentUser(req);
  if (!user) throw new UnauthenticatedError();
  return user;
}

export function cookieAttributes(maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function sessionSetCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_TTL_SECONDS)}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

/** Invalidates every outstanding token for the user (sign-out everywhere, deactivation). */
export function revokeAllSessions(userId: string): void {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return;
  db.update(users)
    .set({ tokenVersion: row.tokenVersion + 1 })
    .where(eq(users.id, userId))
    .run();
}
