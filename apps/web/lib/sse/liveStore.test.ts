import { describe, expect, it } from 'vitest';
import { createLiveStore } from './liveStore';

describe('liveStore', () => {
  it('transitions status and goes offline after 60 s of reconnecting', () => {
    let t = 0;
    const s = createLiveStore(() => t);
    s.setStatus('live');
    expect(s.getState().offlineSince).toBeNull();
    s.setStatus('reconnecting');
    t = 30_000;
    s.tick();
    expect(s.getState().status).toBe('reconnecting');
    expect(s.shouldPoll()).toBe(false);
    t = 61_000;
    s.tick();
    expect(s.getState().status).toBe('offline');
    expect(s.shouldPoll()).toBe(true);
    s.setStatus('live');
    expect(s.shouldPoll()).toBe(false);
  });

  it('expires highlights after 5 s', () => {
    let t = 0;
    const s = createLiveStore(() => t);
    s.highlight('l1');
    expect(s.highlightedIds().has('l1')).toBe(true);
    t = 5001;
    expect(s.highlightedIds().has('l1')).toBe(false);
    expect(s.expire()).toBe(true);
    expect(s.getState().highlighted.size).toBe(0);
  });

  it('notifies subscribers', () => {
    const s = createLiveStore();
    let n = 0;
    const off = s.subscribe(() => n++);
    s.highlight('a');
    off();
    s.highlight('b');
    expect(n).toBe(1);
  });
});
