import { describe, expect, it } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { updatedByFor } from './updated-by';

const act = (by: string | null, leadId = 'l1') =>
  ({
    type: 'activity.created',
    at: 1,
    by,
    teamId: 't',
    ownerId: 'me',
    leadId,
    activity: { id: 'a' },
  }) as unknown as LeadDeskEvent;

describe('updatedByFor', () => {
  it('shows a note for a colleague on the open lead only', () => {
    expect(updatedByFor(act('ben'), 'l1', 'me').note).toBe(true);
    expect(updatedByFor(act('me'), 'l1', 'me').note).toBe(false);
    expect(updatedByFor(act('ben', 'l2'), 'l1', 'me').note).toBe(false);
  });
  it('flags reassignment away from me', () => {
    const e = {
      type: 'lead.assigned',
      at: 1,
      by: 'mgr',
      teamId: 't',
      ownerId: 'ben',
      leadId: 'l1',
      fromOwnerId: 'me',
      toOwnerId: 'ben',
      method: 'MANUAL',
    } as LeadDeskEvent;
    expect(updatedByFor(e, 'l1', 'me')).toEqual({ note: true, reassignedAway: true });
  });
});
