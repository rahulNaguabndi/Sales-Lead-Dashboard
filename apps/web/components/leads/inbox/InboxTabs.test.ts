import { describe, expect, it } from 'vitest';
import { buildTabs } from './InboxTabs';

const counts = { mine: 3, unassigned: 2, dueToday: 1, overdue: 0, newUntouched: 0, goingCold: 0 };

describe('buildTabs', () => {
  it('never offers a Team tab to reps (F03 US-1)', () => {
    const views = buildTabs({ leader: false, orgWide: false }, counts).map((t) => t.view);
    expect(views).not.toContain('team');
    expect(views[0]).toBe('mine');
  });

  it('labels the leader tab Team for managers and All for the VP', () => {
    expect(buildTabs({ leader: true, orgWide: false }, counts)[0]).toMatchObject({
      view: 'team',
      label: 'Team',
    });
    expect(buildTabs({ leader: true, orgWide: true }, counts)[0]).toMatchObject({
      view: 'team',
      label: 'All',
    });
  });
});
