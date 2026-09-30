import { jwtVerify, SignJWT } from 'jose';
import type { Role } from '@leaddesk/shared';
import { CLOCK_TOLERANCE_SECONDS, SESSION_TTL_SECONDS } from './constants';

// Edge-safe: only `jose` and constants are imported.
export type SessionClaims = {
  sub: string;
  role: Role;
  teamId: string | null;
  name: string;
  tv: number;
  jti: string;
  iat: number;
  exp: number;
};

function key(secret = process.env.JWT_SECRET): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}

export async function signSession(
  input: Omit<SessionClaims, 'iat' | 'exp'>,
  opts: { now?: number; secret?: string } = {},
): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const { sub, jti, ...rest } = input;
  return new SignJWT({ ...rest })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key(opts.secret));
}

/** Returns the claims, or null for any invalid/expired/tampered token. */
export async function verifySession(
  token: string | undefined | null,
  opts: { now?: number; secret?: string } = {},
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: ['HS256'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: opts.now ? new Date(opts.now) : undefined,
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number' ||
      typeof payload.tv !== 'number'
    ) {
      return null;
    }
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}
