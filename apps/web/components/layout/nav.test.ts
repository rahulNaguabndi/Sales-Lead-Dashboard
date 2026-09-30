import { describe, expect, it } from 'vitest';
import { getNavItems } from './nav';

describe('getNavItems', () => {
  it('shows four items to a REP', () => {
    expect(getNavItems('REP').map((i) => i.label)).toEqual([
      'Inbox',
      'Pipeline',
      'Dashboard',
      'Offers',
    ]);
  });

  it('adds Team Settings and Audit for MANAGER and VP', () => {
    for (const role of ['MANAGER', 'VP'] as const) {
      const labels = getNavItems(role).map((i) => i.label);
      expect(labels).toContain('Team Settings');
      expect(labels).toContain('Audit');
    }
  });
});
