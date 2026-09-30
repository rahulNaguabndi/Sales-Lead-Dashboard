import { describe, expect, it } from 'vitest';
import {
  defaultCompleteChecked,
  formatDueLabel,
  resolveFollowUpPick,
  resolveSnooze,
} from '@/components/followups/quick-picks';

// Wednesday 30 Sep 2026, 14:30 local time.
const now = new Date(2026, 8, 30, 14, 30, 0, 0);
const parts = (d: Date) => [d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()];

describe('resolveFollowUpPick', () => {
  it('In 2 h', () => {
    expect(resolveFollowUpPick('in2h', now).getTime() - now.getTime()).toBe(2 * 3_600_000);
  });
  it('Tomorrow 10:00 and 18:00', () => {
    expect(parts(resolveFollowUpPick('tomorrow10', now))).toEqual([9, 1, 10, 0]);
    expect(parts(resolveFollowUpPick('tomorrow18', now))).toEqual([9, 1, 18, 0]);
  });
  it('In 3 days keeps the time of day', () => {
    expect(parts(resolveFollowUpPick('in3d', now))).toEqual([9, 3, 14, 30]);
  });
  it('snooze: +1 h and tomorrow 10:00', () => {
    expect(resolveSnooze('plus1h', now).getTime() - now.getTime()).toBe(3_600_000);
    expect(parts(resolveSnooze('tomorrow', now))).toEqual([9, 1, 10, 0]);
  });
});

describe('formatDueLabel', () => {
  const n = now.getTime();
  it('overdue shows relative hours', () => {
    expect(formatDueLabel(n - 2 * 3_600_000, n)).toBe('2 h overdue');
    expect(formatDueLabel(n - 10 * 60_000, n)).toBe('10 min overdue');
    expect(formatDueLabel(n - 3 * 86_400_000, n)).toBe('3 d overdue');
  });
  it('today shows HH:MM', () => {
    expect(formatDueLabel(new Date(2026, 8, 30, 18, 0).getTime(), n)).toMatch(/18[:.]00/);
  });
});

describe('defaultCompleteChecked', () => {
  const n = now.getTime();
  it('checked when overdue or due within 24 h; unchecked otherwise', () => {
    expect(defaultCompleteChecked({ dueAt: n - 3_600_000 }, n)).toBe(true);
    expect(defaultCompleteChecked({ dueAt: n + 23 * 3_600_000 }, n)).toBe(true);
    expect(defaultCompleteChecked({ dueAt: n + 30 * 3_600_000 }, n)).toBe(false);
    expect(defaultCompleteChecked(null, n)).toBe(false);
  });
});
