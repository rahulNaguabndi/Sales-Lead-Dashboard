export const FOLLOW_UP_PICKS = [
  { key: 'in2h', label: 'In 2 h' },
  { key: 'tomorrow10', label: 'Tomorrow 10:00' },
  { key: 'tomorrow18', label: 'Tomorrow 18:00' },
  { key: 'in3d', label: 'In 3 days' },
] as const;

export type FollowUpPickKey = (typeof FOLLOW_UP_PICKS)[number]['key'];

/** Resolves a pick in the browser's local time (DST-safe: uses calendar arithmetic). */
export function resolveFollowUpPick(key: FollowUpPickKey, now: Date = new Date()): Date {
  const d = new Date(now);
  switch (key) {
    case 'in2h':
      return new Date(now.getTime() + 2 * 3_600_000);
    case 'tomorrow10':
    case 'tomorrow18':
      d.setDate(d.getDate() + 1);
      d.setHours(key === 'tomorrow10' ? 10 : 18, 0, 0, 0);
      return d;
    case 'in3d':
      d.setDate(d.getDate() + 3);
      return d;
  }
}

/** Snooze choices: +1 h, tomorrow 10:00, or a custom time picked by the user. */
export function resolveSnooze(key: 'plus1h' | 'tomorrow', now: Date = new Date()): Date {
  return key === 'plus1h' ? new Date(now.getTime() + 3_600_000) : resolveFollowUpPick('tomorrow10', now);
}

/** "18:00" for today's items, "2 h overdue" for past ones, weekday + time otherwise. */
export function formatDueLabel(dueAt: number, now: number = Date.now()): string {
  const diff = now - dueAt;
  if (diff > 0) {
    const mins = Math.round(diff / 60_000);
    if (mins < 60) return `${Math.max(1, mins)} min overdue`;
    const hours = Math.floor(mins / 60);
    return hours < 48 ? `${hours} h overdue` : `${Math.floor(hours / 24)} d overdue`;
  }
  const d = new Date(dueAt);
  const today = new Date(now);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return time;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** The composer pre-ticks "Complete follow-up" when one is due within ±24 h or overdue. */
export function defaultCompleteChecked(followUp: { dueAt: number } | null, now: number = Date.now()): boolean {
  if (!followUp) return false;
  return followUp.dueAt <= now + 24 * 3_600_000;
}
