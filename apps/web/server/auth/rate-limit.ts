import { createHash } from 'node:crypto';
import { getRedis, redisStatus } from '../redis/client';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_SECONDS = 900;

const memory = new Map<string, { count: number; expiresAt: number }>();

export function emailHash(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}

export function loginKey(ip: string, email: string): string {
  return `rl:login:${ip}:${emailHash(email)}`;
}

function memGet(key: string, now: number) {
  const e = memory.get(key);
  if (e && e.expiresAt <= now) {
    memory.delete(key);
    return undefined;
  }
  return e;
}

async function redisGet(key: string): Promise<number | null> {
  if (redisStatus() !== 'connected') return null;
  try {
    const v = await getRedis().get(key);
    return v ? Number(v) : 0;
  } catch {
    return null;
  }
}

/** Number of recorded failures and seconds until the window ends. */
export async function checkLoginLimiter(
  key: string,
  now = Date.now(),
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const fromRedis = await redisGet(key);
  if (fromRedis !== null) {
    if (fromRedis < LOGIN_MAX_FAILURES) return { blocked: false, retryAfterSeconds: 0 };
    let ttl = LOGIN_WINDOW_SECONDS;
    try {
      ttl = Math.max(1, await getRedis().ttl(key));
    } catch {
      /* keep default */
    }
    return { blocked: true, retryAfterSeconds: ttl };
  }
  const e = memGet(key, now);
  if (!e || e.count < LOGIN_MAX_FAILURES) return { blocked: false, retryAfterSeconds: 0 };
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((e.expiresAt - now) / 1000)) };
}

/** Records a failed attempt. */
export async function hitLoginLimiter(key: string, now = Date.now()): Promise<void> {
  if (redisStatus() === 'connected') {
    try {
      const r = getRedis();
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, LOGIN_WINDOW_SECONDS);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  const e = memGet(key, now);
  if (e) e.count += 1;
  else memory.set(key, { count: 1, expiresAt: now + LOGIN_WINDOW_SECONDS * 1000 });
}

export async function resetLoginLimiter(key: string): Promise<void> {
  memory.delete(key);
  if (redisStatus() === 'connected') {
    try {
      await getRedis().del(key);
    } catch {
      /* ignore */
    }
  }
}
