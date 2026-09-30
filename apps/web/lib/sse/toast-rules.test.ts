import { describe, expect, it } from 'vitest';
import type { LeadDeskEvent, LeadSummary } from '@leaddesk/shared';
import { decideToast, shouldGroupPool } from './toast-rules';

const lead = (over: Partial<LeadSummary> = {}) =>
  ({ id: 'l1', priority: 'HOT', ownerId: 'me', ...over }) as LeadSummary;
const created = (l: LeadSummary, by: string | null = null) =>
  ({ type: 'lead.created', at: 1, by, teamId: 't', ownerId: l.ownerId, lead: l }) as LeadDeskEvent;
const assignedEv = (over: Record<string, unknown>) =>
  ({
    type: 'lead.assigned',
    at: 1,
    by: 'mgr',
    teamId: 't',
    ownerId: 'me',
    leadId: 'l1',
    fromOwnerId: null,
    toOwnerId: 'me',
    method: 'MANUAL',
    ...over,
  }) as LeadDeskEvent;

describe('decideToast', () => {
  it('HOT assigned to me lasts 8 s, others 5 s', () => {
    expect(decideToast(created(lead()), 'me', new Map())).toMatchObject({
      kind: 'assigned-to-me',
      hot: true,
      durationMs: 8000,
    });
    expect(decideToast(created(lead({ priority: 'WARM' })), 'me', new Map())).toMatchObject({
      hot: false,
      durationMs: 5000,
    });
  });
  it('no toast for my own actions', () => {
    expect(decideToast(created(lead(), 'me'), 'me', new Map())).toBeNull();
  });
  it('pool arrival gives a pool toast', () => {
    expect(decideToast(created(lead({ ownerId: null })), 'me', new Map())).toMatchObject({
      kind: 'pool',
    });
  });
  it('lead.assigned uses a remembered summary, else falls back to null', () => {
    const e = assignedEv({});
    expect(decideToast(e, 'me', new Map([['l1', lead()]]))).toMatchObject({ hot: true });
    expect(decideToast(e, 'me', new Map())).toMatchObject({
      kind: 'assigned-to-me',
      summary: null,
    });
  });
  it('reassigned away gives an info toast', () => {
    const e = assignedEv({ ownerId: 'ben', fromOwnerId: 'me', toOwnerId: 'ben' });
    expect(decideToast(e, 'me', new Map())).toEqual({ kind: 'reassigned-away', leadId: 'l1' });
  });
  it('follow-up due only for the assignee', () => {
    const e = {
      type: 'followup.due',
      at: 1,
      by: null,
      teamId: 't',
      ownerId: 'me',
      leadId: 'l1',
      followUpId: 'f',
      dueAt: 1,
    } as LeadDeskEvent;
    expect(decideToast(e, 'me', new Map())).toMatchObject({ kind: 'followup-due' });
    expect(decideToast(e, 'other', new Map())).toBeNull();
  });
});

describe('shouldGroupPool', () => {
  it('groups when more than 3 arrive within 10 s', () => {
    expect(shouldGroupPool([0, 1000, 2000], 3000)).toBe(false);
    expect(shouldGroupPool([0, 1000, 2000, 3000], 3000)).toBe(true);
    expect(shouldGroupPool([0, 1000, 2000, 30000], 30000)).toBe(false);
  });
});
