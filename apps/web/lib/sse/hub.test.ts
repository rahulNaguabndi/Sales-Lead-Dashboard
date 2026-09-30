import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { createHub, type HubBus } from './hub';
import type { FilterScope } from './filter';

function fakeBus() {
  let handler: ((e: LeadDeskEvent) => void) | null = null;
  let subs = 0;
  const bus: HubBus = {
    subscribe(h) {
      subs++;
      handler = h;
      return () => (handler = null);
    },
  };
  return { bus, emit: (e: LeadDeskEvent) => handler?.(e), subs: () => subs };
}

const scope = (userIds: string[], teamIds: string[], isVP = false): FilterScope => ({
  userIds: new Set(userIds),
  teamIds: new Set(teamIds),
  isVP,
});
const ev = (over: Record<string, unknown> = {}) =>
  ({
    type: 'lead.updated',
    at: 1,
    by: null,
    leadId: 'l1',
    teamId: 'dach',
    ownerId: 'anna',
    changes: {},
    ...over,
  }) as LeadDeskEvent;

function client(userId: string, sc: FilterScope, lastEventId?: string) {
  const frames: string[] = [];
  const closed = vi.fn();
  return {
    frames,
    closed,
    opts: {
      userId,
      scope: sc,
      lastEventId,
      write: (f: string) => void frames.push(f),
      close: closed,
    },
  };
}

describe('hub', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (loadScope = async () => scope(['anna'], ['dach']) as FilterScope | null) => {
    const b = fakeBus();
    return { ...b, hub: createHub({ bus: b.bus, loadScope }) };
  };

  it('writes retry + hello on connect and subscribes once', () => {
    const { hub, subs } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    const b = client('ben', scope(['ben'], ['dach']));
    hub.connect(a.opts);
    hub.connect(b.opts);
    expect(a.frames[0]).toBe('retry: 3000\n\n');
    expect(a.frames[1]).toContain('event: hello');
    expect(subs()).toBe(1);
  });

  it('broadcasts only to passing connections with increasing ids', () => {
    const { hub, emit } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    const s = client('luca', scope(['luca'], ['south']));
    hub.connect(a.opts);
    hub.connect(s.opts);
    emit(ev());
    emit(ev());
    const ids = a.frames.filter((f) => f.startsWith('id: ')).map((f) => f.split('\n')[0]!);
    expect(ids).toHaveLength(2);
    expect(ids[1]! > ids[0]!).toBe(true);
    expect(s.frames.some((f) => f.startsWith('id: '))).toBe(false);
  });

  it('drops invalid payloads', () => {
    const { hub, emit } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts);
    emit({ type: 'lead.updated' } as unknown as LeadDeskEvent);
    expect(a.frames.some((f) => f.startsWith('id: '))).toBe(false);
  });

  it('dispose clears timers and unregisters', () => {
    const { hub, emit } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts).dispose();
    expect(hub.size()).toBe(0);
    emit(ev());
    vi.advanceTimersByTime(60_000);
    expect(a.frames).toHaveLength(2);
  });

  it('sends a heartbeat every 25 s', () => {
    const { hub } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts);
    vi.advanceTimersByTime(25_000);
    expect(a.frames.at(-1)).toBe(': ping\n\n');
  });

  it('replays filtered events after a known Last-Event-ID, else resync', () => {
    const { hub, emit } = setup();
    const first = client('anna', scope(['anna'], ['dach']));
    hub.connect(first.opts);
    emit(ev());
    emit(ev({ ownerId: 'other', teamId: 'south' }));
    emit(ev({ leadId: 'l2' }));
    const firstId = first.frames
      .find((f) => f.startsWith('id: '))!
      .split('\n')[0]!
      .slice(4);
    const re = client('anna', scope(['anna'], ['dach']), firstId);
    hub.connect(re.opts);
    const replayed = re.frames.filter((f) => f.startsWith('id: '));
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toContain('"leadId":"l2"');
    const unknown = client('anna', scope(['anna'], ['dach']), 'nope');
    hub.connect(unknown.opts);
    expect(unknown.frames.some((f) => f.includes('event: resync'))).toBe(true);
  });

  it('keeps only the last 500 events', () => {
    const { hub, emit } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts);
    for (let i = 0; i < 501; i++) emit(ev({ leadId: `l${i}` }));
    const firstId = a.frames
      .find((f) => f.startsWith('id: '))!
      .split('\n')[0]!
      .slice(4);
    const re = client('anna', scope(['anna'], ['dach']), firstId);
    hub.connect(re.opts);
    expect(re.frames.some((f) => f.includes('event: resync'))).toBe(true);
  });

  it('closes the oldest stream when a user opens a 6th', () => {
    const { hub } = setup();
    const cs = Array.from({ length: 6 }, () => client('anna', scope(['anna'], ['dach'])));
    cs.forEach((c) => hub.connect(c.opts));
    expect(cs[0]!.closed).toHaveBeenCalled();
    expect(cs[1]!.closed).not.toHaveBeenCalled();
    expect(hub.size()).toBe(5);
  });

  it('refreshes scope every 60 s and closes when the user is gone', async () => {
    let active: FilterScope | null = scope(['anna'], ['dach']);
    const { hub } = setup(async () => active);
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.closed).not.toHaveBeenCalled();
    active = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.closed).toHaveBeenCalled();
    expect(hub.size()).toBe(0);
  });

  it('delivers in-process events (memory bus mode)', () => {
    const { hub, emit } = setup();
    const a = client('anna', scope(['anna'], ['dach']));
    hub.connect(a.opts);
    emit(ev());
    expect(a.frames.at(-1)).toContain('event: lead.updated');
  });
});
