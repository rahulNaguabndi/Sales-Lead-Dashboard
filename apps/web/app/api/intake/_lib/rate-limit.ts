import { getRedis, redisStatus } from '@/server/redis/client';

export const LIMIT = 60;
export const WINDOW_S = 60;

const memory = new Map<string, { count: number; resetAt: number }>();
let lastDegradedLog = 0;

function logDegraded(): void {
  const now = Date.now();
  if (now - lastDegradedLog < 60_000) return;
  lastDegradedLog = now;
  console.warn(JSON.stringify({ level: 'warn', msg: 'redis_degraded', area: 'intake_rate_limit' }));
}

function hitMemory(key: string, now: number): number {
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_S * 1000 });
    return 1;
  }
  return ++cur.count;
}

/** Fixed window per key+IP. Returns the retry-after seconds when over the limit, else null. */
export async function checkRateLimit(
  keyName: string,
  ip: string,
  now = Date.now(),
): Promise<number | null> {
  const key = `rl:intake:${keyName}:${ip}`;
  if (redisStatus() === 'connected') {
    try {
      const r = getRedis();
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, WINDOW_S);
      if (count > LIMIT) {
        const ttl = await r.ttl(key);
        return ttl > 0 ? ttl : WINDOW_S;
      }
      return null;
    } catch {
      /* fall back to memory */
    }
  }
  logDegraded();
  const count = hitMemory(key, now);
  if (count <= LIMIT) return null;
  return Math.max(1, Math.ceil(((memory.get(key)?.resetAt ?? now) - now) / 1000));
}

export function resetRateLimitMemory(): void {
  memory.clear();
  lastDegradedLog = 0;
}
