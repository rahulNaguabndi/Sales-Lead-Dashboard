import { describe, expect, it, vi } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { bus } from './bus';

const event: LeadDeskEvent = {
  type: 'lead.assigned',
  at: 1,
  teamId: 't1',
  ownerId: 'u1',
  by: null,
  leadId: 'l1',
  fromOwnerId: null,
  toOwnerId: 'u1',
  method: 'AUTO',
};

describe('event bus (memory mode)', () => {
  it('delivers to a local subscriber exactly once', async () => {
    const handler = vi.fn();
    const off = bus.subscribe(handler);
    await bus.publish(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
    off();
  });

  it('never throws from publish, even with bad data or a throwing subscriber', async () => {
    const off = bus.subscribe(() => {
      throw new Error('boom');
    });
    await expect(bus.publish({ type: 'nope' } as unknown as LeadDeskEvent)).resolves.toBeUndefined();
    off();
  });

  it('stops delivery after unsubscribe', async () => {
    const handler = vi.fn();
    const off = bus.subscribe(handler);
    off();
    await bus.publish(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports memory mode when Redis is unavailable', () => {
    expect(bus.mode()).toBe('memory');
  });
});
