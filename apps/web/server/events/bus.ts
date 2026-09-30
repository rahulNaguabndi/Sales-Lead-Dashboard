import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { EVENTS_CHANNEL, type LeadDeskEvent } from '@leaddesk/shared';
import { getRedis, getRedisSubscriber, redisStatus } from '../redis/client';

export interface EventBus {
  /** Never throws; failures are logged. */
  publish(e: LeadDeskEvent): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(handler: (e: LeadDeskEvent) => void): () => void;
  mode(): 'redis' | 'memory';
}

type Envelope = { origin: string; event: LeadDeskEvent };

class LeadDeskBus implements EventBus {
  // Identifies this process so events it published are not re-delivered from Redis.
  private readonly origin = randomUUID();
  private readonly emitter = new EventEmitter();
  private redisSubscribed = false;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  async publish(e: LeadDeskEvent): Promise<void> {
    try {
      this.emitter.emit('event', e);
    } catch (err) {
      console.warn('[bus] local delivery failed:', (err as Error).message);
    }
    if (redisStatus() !== 'connected') return;
    try {
      const envelope: Envelope = { origin: this.origin, event: e };
      await getRedis().publish(EVENTS_CHANNEL, JSON.stringify(envelope));
    } catch (err) {
      console.warn('[bus] redis publish failed:', (err as Error).message);
    }
  }

  subscribe(handler: (e: LeadDeskEvent) => void): () => void {
    const wrapped = (e: LeadDeskEvent) => {
      try {
        handler(e);
      } catch (err) {
        console.warn('[bus] subscriber threw:', (err as Error).message);
      }
    };
    this.emitter.on('event', wrapped);
    this.ensureRedisSubscription();
    return () => {
      this.emitter.off('event', wrapped);
    };
  }

  mode(): 'redis' | 'memory' {
    return redisStatus() === 'connected' ? 'redis' : 'memory';
  }

  private ensureRedisSubscription(): void {
    if (this.redisSubscribed || process.env.VITEST) return;
    this.redisSubscribed = true;
    try {
      const sub = getRedisSubscriber();
      sub.on('message', (_channel: string, raw: string) => {
        try {
          const envelope = JSON.parse(raw) as Envelope;
          if (envelope.origin === this.origin) return; // already delivered locally
          this.emitter.emit('event', envelope.event);
        } catch {
          /* malformed message: ignore */
        }
      });
      // Re-subscribe on every (re)connect; the call fails harmlessly while degraded.
      const subscribe = () => sub.subscribe(EVENTS_CHANNEL).catch(() => undefined);
      sub.on('ready', subscribe);
      subscribe();
    } catch (err) {
      console.warn('[bus] redis subscribe failed:', (err as Error).message);
    }
  }
}

const g = globalThis as unknown as { __bus?: EventBus };

/** Process-wide singleton (survives Next.js hot reload). */
export const bus: EventBus = (g.__bus ??= new LeadDeskBus());
