import { describe, expect, it } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { filterFor, type FilterScope } from './filter';

const scope = (userIds: string[], teamIds: string[], isVP = false): FilterScope => ({
  userIds: new Set(userIds),
  teamIds: new Set(teamIds),
  isVP,
});
const rep = scope(['anna'], ['dach']);
const southRep = scope(['luca'], ['south']);
const manager = scope(['mgr', 'anna', 'ben'], ['dach']);
const vp = scope(['vp'], [], true);

const assigned = (over: Record<string, unknown> = {}) =>
  ({
    type: 'lead.assigned', at: 1, by: 'mgr', leadId: 'l1', teamId: 'dach', ownerId: 'anna',
    fromOwnerId: null, toOwnerId: 'anna', method: 'MANUAL', ...over,
  }) as LeadDeskEvent;

describe('filterFor', () => {
  it('delivers events on the owner lead', () => {
    expect(filterFor(rep, 'anna')(assigned())).toBe(true);
    expect(filterFor(southRep, 'luca')(assigned())).toBe(false);
  });
  it('delivers pool leads to the team only', () => {
    const pool = assigned({ ownerId: null, toOwnerId: null });
    expect(filterFor(rep, 'anna')(pool)).toBe(true);
    expect(filterFor(southRep, 'luca')(pool)).toBe(false);
  });
  it('tells the previous owner about a reassignment', () => {
    const e = assigned({ ownerId: 'ben', fromOwnerId: 'anna', toOwnerId: 'ben' });
    expect(filterFor(rep, 'anna')(e)).toBe(true);
    expect(filterFor(southRep, 'luca')(e)).toBe(false);
  });
  it('does not show a rep a colleague lead', () => {
    expect(filterFor(rep, 'anna')(assigned({ ownerId: 'ben', toOwnerId: 'ben' }))).toBe(false);
  });
  it('manager sees the subtree; VP sees all', () => {
    const e = assigned({ ownerId: 'ben', toOwnerId: 'ben' });
    expect(filterFor(manager, 'mgr')(e)).toBe(true);
    expect(filterFor(manager, 'mgr')(assigned({ teamId: 'south', ownerId: 'luca' }))).toBe(false);
    expect(filterFor(vp, 'vp')(assigned({ teamId: 'south', ownerId: 'luca' }))).toBe(true);
  });
  it('offer.changed goes to everyone', () => {
    const e = { type: 'offer.changed', offerId: 'o', teamId: null, ownerId: null, at: 1, by: null } as LeadDeskEvent;
    expect(filterFor(southRep, 'luca')(e)).toBe(true);
  });
  it('followup.due only reaches the assignee', () => {
    const e = { type: 'followup.due', followUpId: 'f', leadId: 'l1', dueAt: 1, at: 1, by: null, teamId: 'dach', ownerId: 'anna' } as LeadDeskEvent;
    expect(filterFor(rep, 'anna')(e)).toBe(true);
    expect(filterFor(manager, 'mgr')(e)).toBe(false);
  });
});
