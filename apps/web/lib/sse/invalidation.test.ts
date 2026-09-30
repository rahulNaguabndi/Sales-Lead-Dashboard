import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { createInvalidator, keysFor } from './invalidation';

const created = (i = 0) =>
  ({
    type: 'lead.created',
    at: i,
    by: null,
    teamId: 'dach',
    ownerId: null,
    lead: { id: `l${i}` },
  }) as unknown as LeadDeskEvent;

describe('keysFor', () => {
  it('maps events to query keys', () => {
    expect(keysFor(created())).toEqual([['leads'], ['followups'], ['dashboard']]);
    const act = { type: 'activity.created', leadId: 'l9' } as LeadDeskEvent;
    expect(keysFor(act)).toEqual([['lead', 'l9', 'activities']]);
    expect(keysFor({ type: 'followup.due' } as LeadDeskEvent)).toEqual([['followups']]);
    expect(keysFor({ type: 'offer.changed' } as LeadDeskEvent)).toEqual([['offers'], ['lead']]);
    expect(keysFor({ type: 'lead.updated', leadId: 'x' } as LeadDeskEvent)[0]).toEqual([
      'lead',
      'x',
    ]);
  });
});

describe('invalidator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const count = (client: { invalidateQueries: ReturnType<typeof vi.fn> }, root: string) =>
    client.invalidateQueries.mock.calls.filter(([f]) => f?.queryKey?.[0] === root).length;

  it('debounces per key at 250 ms', () => {
    const client = { invalidateQueries: vi.fn() };
    const inv = createInvalidator(client);
    for (let i = 0; i < 10; i++) inv.handle(created(i));
    vi.advanceTimersByTime(250);
    expect(count(client, 'leads')).toBe(1);
  });

  it('refreshes the dashboard at most once per 5 s under a burst', () => {
    const client = { invalidateQueries: vi.fn() };
    const inv = createInvalidator(client);
    for (let i = 0; i < 100; i++) {
      inv.handle(created(i));
      vi.advanceTimersByTime(40);
    }
    expect(count(client, 'dashboard')).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(count(client, 'dashboard')).toBe(1);
  });

  it('all() invalidates everything', () => {
    const client = { invalidateQueries: vi.fn() };
    createInvalidator(client).all();
    expect(client.invalidateQueries).toHaveBeenCalledWith();
  });
});
