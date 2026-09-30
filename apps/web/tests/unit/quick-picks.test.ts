import { describe, expect, it } from 'vitest';
import { resolveQuickPick } from '@/components/leads/composer/quick-picks';

// Wednesday 30 Sep 2026, 14:30 local time.
const now = new Date(2026, 8, 30, 14, 30, 0, 0);

describe('resolveQuickPick', () => {
  it('In 2 h adds two hours', () => {
    expect(resolveQuickPick('in2h', now)!.getTime() - now.getTime()).toBe(2 * 3_600_000);
  });
  it('Tomorrow 10:00 is 1 Oct at 10:00', () => {
    const d = resolveQuickPick('tomorrow10', now)!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 1, 10, 0,
    ]);
  });
  it('In 3 days keeps the time of day', () => {
    const d = resolveQuickPick('in3d', now)!;
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([9, 3, 14, 30]);
  });
  it('Next Monday 10:00 is strictly after today', () => {
    const d = resolveQuickPick('nextMonday10', now)!;
    expect(d.getDay()).toBe(1);
    expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([9, 5, 10]);
    const monday = new Date(2026, 9, 5, 8, 0);
    expect(resolveQuickPick('nextMonday10', monday)!.getDate()).toBe(12);
    const sunday = new Date(2026, 9, 4, 8, 0);
    expect(resolveQuickPick('nextMonday10', sunday)!.getDate()).toBe(5);
  });
  it('custom has no preset', () => {
    expect(resolveQuickPick('custom', now)).toBeNull();
  });
  it('every preset is within the 1 min .. 90 day window', () => {
    for (const k of ['in2h', 'tomorrow10', 'in3d', 'nextMonday10'] as const) {
      const delta = resolveQuickPick(k, now)!.getTime() - now.getTime();
      expect(delta).toBeGreaterThan(60_000);
      expect(delta).toBeLessThan(90 * 86_400_000);
    }
  });
});
