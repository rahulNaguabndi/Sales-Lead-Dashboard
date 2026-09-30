import { getRedis, redisStatus } from '../redis/client';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** SCAN + UNLINK; never KEYS. */
  delByPrefix(prefix: string): Promise<void>;
  /** Cache-aside: return the cached value or load and store it. */
  wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
}

/** The subset of ioredis the cache needs (lets tests inject a fake). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  unlink(...keys: string[]): Promise<unknown>;
  scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
}

const PREFIX = 'cache:';

export class RedisCache implements Cache {
  constructor(private readonly redis: RedisLike) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(PREFIX + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      // Every key carries a TTL (FR-005): volatile-lru only evicts keys that expire.
      await this.redis.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache failures never break the request */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys.map((k) => PREFIX + k));
    } catch {
      /* ignore */
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${PREFIX}${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.redis.unlink(...keys);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }

  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await loader();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

/** Degraded-mode cache: never stores anything, always loads. */
export class NoopCache implements Cache {
  async get<T>(): Promise<T | null> {
    return null;
  }
  async set(): Promise<void> {}
  async del(): Promise<void> {}
  async delByPrefix(): Promise<void> {}
  async wrap<T>(_key: string, _ttl: number, loader: () => Promise<T>): Promise<T> {
    return loader();
  }
}

const noop = new NoopCache();
let redisCache: RedisCache | undefined;

function current(): Cache {
  if (redisStatus() !== 'connected') return noop;
  redisCache ??= new RedisCache(getRedis() as unknown as RedisLike);
  return redisCache;
}

/** Re-evaluates the backing implementation on every call, so it follows Redis up/down. */
export const cache: Cache = {
  get: (key) => current().get(key),
  set: (key, value, ttl) => current().set(key, value, ttl),
  del: (...keys) => current().del(...keys),
  delByPrefix: (prefix) => current().delByPrefix(prefix),
  wrap: (key, ttl, loader) => current().wrap(key, ttl, loader),
};
