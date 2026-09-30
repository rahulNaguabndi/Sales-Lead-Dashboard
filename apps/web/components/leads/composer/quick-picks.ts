export const QUICK_PICKS = [
  { key: 'in2h', label: 'In 2 h' },
  { key: 'tomorrow10', label: 'Tomorrow 10:00' },
  { key: 'in3d', label: 'In 3 days' },
  { key: 'nextMonday10', label: 'Next Monday 10:00' },
  { key: 'custom', label: 'Custom' },
] as const;

export type QuickPickKey = (typeof QUICK_PICKS)[number]['key'];

/** Resolves a quick pick to a local Date. `custom` has no preset value and returns null. */
export function resolveQuickPick(key: QuickPickKey, now: Date = new Date()): Date | null {
  switch (key) {
    case 'in2h':
      return new Date(now.getTime() + 2 * 3_600_000);
    case 'tomorrow10': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    }
    case 'in3d': {
      const d = new Date(now);
      d.setDate(d.getDate() + 3);
      return d;
    }
    case 'nextMonday10': {
      const d = new Date(now);
      const daysAhead = (8 - d.getDay()) % 7 || 7; // strictly after today
      d.setDate(d.getDate() + daysAhead);
      d.setHours(10, 0, 0, 0);
      return d;
    }
    case 'custom':
      return null;
  }
}
