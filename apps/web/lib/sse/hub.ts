import { monotonicFactory } from 'ulid';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { filterFor, type FilterScope } from './filter';
import { isValidEvent } from './validate';
import { eventFrame, helloFrame, HEARTBEAT_MS, PING_FRAME, resyncFrame, retryFrame } from './wire';

export const BUFFER_SIZE = 500;
export const MAX_STREAMS_PER_USER = 5;
export const SCOPE_REFRESH_MS = 60_000;

export type HubBus = { subscribe(handler: (e: LeadDeskEvent) => void): () => void };

export type HubDeps = {
  bus: HubBus;
  /** Resolves the user's current scope; null when the user is revoked, inactive or missing. */
  loadScope: (userId: string) => Promise<FilterScope | null>;
  now?: () => number;
};

export type ConnectOptions = {
  userId: string;
  scope: FilterScope;
  lastEventId?: string | null;
  write: (frame: string) => void;
  close: () => void;
};

type Conn = ConnectOptions & {
  id: number;
  test: (e: LeadDeskEvent) => boolean;
  timers: ReturnType<typeof setInterval>[];
};

export function createHub(deps: HubDeps) {
  const now = deps.now ?? Date.now;
  const nextId = monotonicFactory();
  const conns = new Map<number, Conn>();
  const buffer: { id: string; event: LeadDeskEvent }[] = [];
  let seq = 0;
  let unsubscribe: (() => void) | null = null;

  const safeWrite = (c: Conn, frame: string) => {
    try {
      c.write(frame);
    } catch {
      drop(c, true);
    }
  };

  function drop(c: Conn, closeStream: boolean) {
    if (!conns.delete(c.id)) return;
    c.timers.forEach(clearInterval);
    c.timers = [];
    if (closeStream) {
      try {
        c.close();
      } catch {
        /* already closed */
      }
    }
  }

  async function refresh(c: Conn) {
    try {
      const scope = await deps.loadScope(c.userId);
      if (!conns.has(c.id)) return;
      if (!scope) return drop(c, true);
      c.scope = scope;
      c.test = filterFor(scope, c.userId);
    } catch (err) {
      console.warn('[sse] scope refresh failed:', (err as Error).message);
    }
  }

  function broadcast(event: LeadDeskEvent) {
    if (!isValidEvent(event)) {
      console.warn('[sse] dropped invalid event payload');
      return;
    }
    const id = nextId(now());
    buffer.push({ id, event });
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    for (const c of [...conns.values()]) {
      if (c.test(event)) safeWrite(c, eventFrame(id, event));
    }
    // A (re)assignment can change whose teams a manager/rep is in; refresh the involved users now.
    if (event.type === 'lead.assigned') {
      for (const c of conns.values()) {
        if (c.userId === event.toOwnerId || c.userId === event.fromOwnerId) void refresh(c);
      }
    }
  }

  function ensureSubscribed() {
    unsubscribe ??= deps.bus.subscribe(broadcast);
  }

  function connect(opts: ConnectOptions) {
    ensureSubscribed();
    const mine = [...conns.values()].filter((c) => c.userId === opts.userId);
    if (mine.length >= MAX_STREAMS_PER_USER) drop(mine[0]!, true);

    const c: Conn = { ...opts, id: ++seq, test: filterFor(opts.scope, opts.userId), timers: [] };
    conns.set(c.id, c);
    safeWrite(c, retryFrame());
    safeWrite(c, helloFrame(opts.userId, now()));

    if (opts.lastEventId) {
      const idx = buffer.findIndex((b) => b.id === opts.lastEventId);
      if (idx === -1) safeWrite(c, resyncFrame());
      else
        for (const b of buffer.slice(idx + 1))
          if (c.test(b.event)) safeWrite(c, eventFrame(b.id, b.event));
    }

    c.timers.push(setInterval(() => safeWrite(c, PING_FRAME), HEARTBEAT_MS));
    c.timers.push(setInterval(() => void refresh(c), SCOPE_REFRESH_MS));
    return { id: c.id, dispose: () => drop(c, false) };
  }

  return {
    connect,
    broadcast,
    size: () => conns.size,
    /** Test helper / shutdown. */
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      [...conns.values()].forEach((c) => drop(c, true));
    },
  };
}

export type Hub = ReturnType<typeof createHub>;
