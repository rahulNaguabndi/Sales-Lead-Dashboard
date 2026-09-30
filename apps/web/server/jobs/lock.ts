import { getRedis, redisStatus } from '../redis/client';

const LOCK_PX = 55_000;
const memory = new Map<string, number>();
let warned = false;

/**
 * Runs fn under `lock:job:<name>` (SET NX PX 55000). Returns null when another instance holds the
 * lock. Without Redis the job runs under an in-process lock only (single instance assumed).
 */
export async function withJobLock<T>(name: string, fn: () => Promise<T> | T): Promise<T | null> {
  const key = `lock:job:${name}`;
  let viaRedis = false;
  if (redisStatus() === 'connected') {
    try {
      const ok = await getRedis().set(key, String(process.pid), 'PX', LOCK_PX, 'NX');
      if (ok !== 'OK') return null;
      viaRedis = true;
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn('[jobs] redis lock failed, running unlocked:', (err as Error).message);
      }
    }
  } else if (!warned) {
    warned = true;
    console.warn('[jobs] Redis unavailable: job lock is in-process only');
  }
  if (!viaRedis) {
    const until = memory.get(key) ?? 0;
    if (until > Date.now()) return null;
    memory.set(key, Date.now() + LOCK_PX);
  }
  try {
    return await fn();
  } finally {
    // Redis lock is left to expire (PX) so two instances do not double-run within the interval.
    if (!viaRedis) memory.delete(key);
  }
}

export function resetJobLocksForTests(): void {
  memory.clear();
  warned = false;
}
