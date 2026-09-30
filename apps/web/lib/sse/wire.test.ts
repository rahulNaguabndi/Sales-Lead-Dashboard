import { describe, expect, it } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { eventFrame, helloFrame, PING_FRAME, resyncFrame, retryFrame } from './wire';

describe('sse wire frames', () => {
  it('encodes retry, hello, resync and ping', () => {
    expect(retryFrame()).toBe('retry: 3000\n\n');
    expect(helloFrame('u1', 5)).toBe('event: hello\ndata: {"userId":"u1","serverTime":5}\n\n');
    expect(resyncFrame()).toBe('event: resync\ndata: {}\n\n');
    expect(PING_FRAME).toBe(': ping\n\n');
  });
  it('encodes an event frame ending with a blank line', () => {
    const e = {
      type: 'offer.changed',
      offerId: 'o',
      teamId: null,
      ownerId: null,
      at: 1,
      by: null,
    } as LeadDeskEvent;
    const f = eventFrame('01ABC', e);
    expect(f.startsWith('id: 01ABC\nevent: offer.changed\ndata: {')).toBe(true);
    expect(f.endsWith('\n\n')).toBe(true);
  });
});
