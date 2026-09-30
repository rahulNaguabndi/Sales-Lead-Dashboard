import { describe, expect, it, vi } from 'vitest';
import { NoopCache, RedisCache, cache, type RedisLike } from './cache';

function fakeRedis(): RedisLike & { store: Map<string, string>; ttls: Map<string, number> } {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v, _mode, ttl) {
      store.set(k, v);
      ttls.set(k, ttl);
    },
    async del(...keys) {
      keys.forEach((k) => store.delete(k));
    },
    async unlink(...keys) {
      keys.forEach((k) => store.delete(k));
    },
    async scan(_cursor, _m, pattern) {
      const prefix = String(pattern).replace(/\*$/, '');
      return ['0', [...store.keys()].filter((k) => k.startsWith(prefix))];
    },
  };
}

describe('RedisCache', () => {
  it('wrap calls the loader once and then serves from cache', async () => {
    const c = new RedisCache(fakeRedis());
    const loader = vi.fn(async () => ({ n: 1 }));
    expect(await c.wrap('k', 60, loader)).toEqual({ n: 1 });
    expect(await c.wrap('k', 60, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('prefixes keys with cache: and always sets a TTL', async () => {
    const redis = fakeRedis();
    await new RedisCache(redis).set('abc', 1, 30);
    expect(redis.store.has('cache:abc')).toBe(true);
    expect(redis.ttls.get('cache:abc')).toBe(30);
  });

  it('del invalidates so the loader runs again', async () => {
    const c = new RedisCache(fakeRedis());
    const loader = vi.fn(async () => 'v');
    await c.wrap('k', 60, loader);
    await c.del('k');
    await c.wrap('k', 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('delByPrefix removes matching keys only', async () => {
    const c = new RedisCache(fakeRedis());
    await c.set('dash:a', 1, 60);
    await c.set('dash:b', 2, 60);
    await c.set('other', 3, 60);
    await c.delByPrefix('dash:');
    expect(await c.get('dash:a')).toBeNull();
    expect(await c.get('other')).toBe(3);
  });

  it('get on a missing key returns null', async () => {
    expect(await new RedisCache(fakeRedis()).get('missing')).toBeNull();
  });
});

describe('NoopCache / degraded default', () => {
  it('always calls the loader and never caches', async () => {
    const c = new NoopCache();
    const loader = vi.fn(async () => 1);
    await c.wrap('k', 60, loader);
    await c.wrap('k', 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(await c.get('k')).toBeNull();
  });

  it('the exported cache falls back to no-op when Redis is not connected', async () => {
    const loader = vi.fn(async () => 1);
    await cache.wrap('k', 60, loader);
    await cache.wrap('k', 60, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
