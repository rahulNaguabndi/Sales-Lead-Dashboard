import Redis from 'ioredis';

export type RedisState = 'connected' | 'degraded';

const RECONNECT_MS = 10_000;

type Slot = { client?: Redis; status: RedisState; logged: boolean; timer?: NodeJS.Timeout };

const g = globalThis as unknown as { __redis?: Slot; __redisSub?: Slot };

function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

function create(slot: Slot, label: string): Redis {
  const client = new Redis(redisUrl(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 500,
    lazyConnect: true,
    // Reconnects are scheduled by us (every 10 s) so the failure mode is predictable.
    retryStrategy: () => null,
  });

  const degrade = (err?: Error) => {
    slot.status = 'degraded';
    if (err && !slot.logged) {
      slot.logged = true;
      console.warn(`[Redis error] ${label}: ${err.message || 'connection failed'} - degraded mode`);
    }
    if (!slot.timer) {
      slot.timer = setTimeout(() => {
        slot.timer = undefined;
        connect();
      }, RECONNECT_MS);
      slot.timer.unref?.();
    }
  };

  const connect = () => {
    if (client.status === 'ready' || client.status === 'connecting' || client.status === 'connect') {
      return;
    }
    client.connect().catch((err: Error) => degrade(err));
  };

  client.on('error', (err: Error) => degrade(err));
  client.on('close', () => degrade());
  client.on('ready', () => {
    slot.status = 'connected';
    slot.logged = false;
    console.info(`[Redis] ${label} connected`);
  });

  connect();
  return client;
}

function getSlot(key: '__redis' | '__redisSub', label: string): Redis {
  const slot = (g[key] ??= { status: 'degraded', logged: false });
  slot.client ??= create(slot, label);
  return slot.client;
}

/** Shared command client. Lazy singleton; never throws to callers. */
export function getRedis(): Redis {
  return getSlot('__redis', 'command client');
}

/** Dedicated subscriber connection (cannot issue regular commands). */
export function getRedisSubscriber(): Redis {
  return getSlot('__redisSub', 'subscriber');
}

export function redisStatus(): RedisState {
  return g.__redis?.status ?? 'degraded';
}
