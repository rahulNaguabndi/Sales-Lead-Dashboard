import { cache } from '../../cache/cache';
import { getRedis, redisStatus } from '../../redis/client';

const TTL_SECONDS = 86_400;
const LRU_MAX = 200;
const WINDOW_MS = 3_600_000;

type Entry = { value: unknown; expires: number };
const lru = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function lruGet(key: string, now: number): unknown | undefined {
  const e = lru.get(key);
  if (!e) return undefined;
  if (e.expires < now) {
    lru.delete(key);
    return undefined;
  }
  lru.delete(key);
  lru.set(key, e); // refresh recency
  return e.value;
}

function lruSet(key: string, value: unknown, now: number): void {
  lru.set(key, { value, expires: now + TTL_SECONDS * 1000 });
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value as string);
}

export type Generated<T> = { value: T; cacheable: boolean };

/**
 * Cache-aside keyed by content fingerprint. Redis when available, in-memory LRU always.
 * Concurrent misses for the same key share one generator run (single-flight).
 * Only results flagged `cacheable` (real AI output) are stored.
 */
export async function getOrGenerate<T>(
  kind: 'suggest' | 'draft',
  leadId: string,
  fp: string,
  generate: () => Promise<Generated<T>>,
  opts: { bypass?: boolean; now?: number } = {},
): Promise<{ value: T; cached: boolean }> {
  const key = `ai:${kind}:${leadId}:${fp}`;
  const now = opts.now ?? Date.now();

  if (!opts.bypass) {
    const local = lruGet(key, now) as T | undefined;
    if (local !== undefined) return { value: local, cached: true };
    const remote = await cache.get<T>(key).catch(() => null);
    if (remote !== null) {
      lruSet(key, remote, now);
      return { value: remote, cached: true };
    }
    const pending = inflight.get(key) as Promise<{ value: T; cached: boolean }> | undefined;
    if (pending) return pending;
  }

  const run = (async () => {
    try {
      const { value, cacheable } = await generate();
      if (cacheable) {
        lruSet(key, value, now);
        await cache.set(key, value, TTL_SECONDS).catch(() => undefined);
      }
      return { value, cached: false };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

export function resetAiCache(): void {
  lru.clear();
  inflight.clear();
  windows.clear();
}

// --- Rate limiter: N generations per user per hour -------------------------------------------

type Win = { count: number; start: number };
const windows = new Map<string, Win>();

export type RateResult = { allowed: boolean; minutesLeft: number };

/** Counts one generation for the user. Redis when connected, in-memory otherwise. */
export async function takeRateLimit(
  userId: string,
  limit: number,
  now: number = Date.now(),
): Promise<RateResult> {
  if (redisStatus() === 'connected') {
    try {
      const redis = getRedis();
      const key = `rl:ai:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WINDOW_MS / 1000);
      if (count > limit) {
        const ttl = await redis.ttl(key);
        return { allowed: false, minutesLeft: Math.max(1, Math.ceil(Math.max(ttl, 0) / 60)) };
      }
      return { allowed: true, minutesLeft: 0 };
    } catch {
      /* fall through to memory */
    }
  }
  let w = windows.get(userId);
  if (!w || now - w.start >= WINDOW_MS) {
    w = { count: 0, start: now };
    windows.set(userId, w);
  }
  if (w.count >= limit) {
    return { allowed: false, minutesLeft: Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 60_000)) };
  }
  w.count += 1;
  return { allowed: true, minutesLeft: 0 };
}
