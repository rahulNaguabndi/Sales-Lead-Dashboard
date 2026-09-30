import { describe, expect, it } from 'vitest';
import type { LeadDeskEvent } from '@leaddesk/shared';
import { createHub } from './hub';
import type { FilterScope } from './filter';

// SC-002: a stream never receives events outside its scope.
const sc = (u: string[], t: string[], vp = false): FilterScope => ({
  userIds: new Set(u),
  teamIds: new Set(t),
  isVP: vp,
});

describe('scope leak', () => {
  it('delivers only in-scope events across DACH rep, SOUTH rep, DACH manager and VP', () => {
    let emit: (e: LeadDeskEvent) => void = () => undefined;
    const hub = createHub({
      bus: { subscribe: (h) => ((emit = h), () => undefined) },
      loadScope: async () => null,
    });
    const mk = (userId: string, scope: FilterScope) => {
      const frames: string[] = [];
      hub.connect({ userId, scope, write: (f) => void frames.push(f), close: () => undefined });
      return () => frames.filter((f) => f.startsWith('id: ')).length;
    };
    const dachRep = mk('anna', sc(['anna'], ['dach']));
    const southRep = mk('luca', sc(['luca'], ['south']));
    const dachMgr = mk('mgr', sc(['mgr', 'anna', 'ben'], ['dach']));
    const vp = mk('vp', sc(['vp'], [], true));

    for (let i = 0; i < 20; i++) {
      const own = i % 2 === 0;
      emit({
        type: 'lead.updated',
        at: i,
        by: null,
        leadId: `l${i}`,
        teamId: 'dach',
        ownerId: own ? 'anna' : 'ben',
        changes: {},
      });
    }
    emit({
      type: 'followup.due',
      at: 1,
      by: null,
      followUpId: 'f',
      leadId: 'l0',
      dueAt: 1,
      teamId: 'dach',
      ownerId: 'anna',
    });

    expect(southRep()).toBe(0);
    expect(dachRep()).toBe(11); // 10 own + follow-up
    expect(dachMgr()).toBe(20); // subtree events, not the assignee-only follow-up
    expect(vp()).toBe(21);
  });
});
