import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { handleEvents } from './handler';
import { createHub } from './hub';
import type { FilterScope } from './filter';

const user = { id: 'anna', name: 'Anna', email: 'a@x', role: 'REP' as const, teamId: 'dach' };
const scope: FilterScope = { userIds: new Set(['anna']), teamIds: new Set(['dach']), isVP: false };

function setup(getUser = async () => user as typeof user | null) {
  let handler: ((e: LeadDeskEvent) => void) | null = null;
  const hub = createHub({
    bus: { subscribe: (h) => ((handler = h), () => undefined) },
    loadScope: async () => scope,
  });
  const deps = { getUser, getHub: () => hub, loadScope: async () => scope };
  return { hub, deps, emit: (e: LeadDeskEvent) => handler?.(e) };
}

describe('GET /api/events handler', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('401s without a session', async () => {
    const { deps } = setup(async () => null);
    const res = await handleEvents(new Request('http://x/api/events'), deps);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });

  it('streams retry, hello, events and heartbeats; abort cleans up', async () => {
    const { deps, emit, hub } = setup();
    const ac = new AbortController();
    const res = await handleEvents(new Request('http://x/api/events', { signal: ac.signal }), deps);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const read = async () => dec.decode((await reader.read()).value);
    expect(await read()).toBe('retry: 3000\n\n');
    expect(await read()).toContain('event: hello');
    emit({ type: 'lead.updated', at: 1, by: null, leadId: 'l1', teamId: 'dach', ownerId: 'anna', changes: {} });
    expect(await read()).toContain('event: lead.updated');
    vi.advanceTimersByTime(25_000);
    expect(await read()).toBe(': ping\n\n');
    // SC-003: ten idle minutes keep producing heartbeats.
    vi.advanceTimersByTime(600_000);
    expect(hub.size()).toBe(1);
    ac.abort();
    expect(hub.size()).toBe(0);
  });
});
