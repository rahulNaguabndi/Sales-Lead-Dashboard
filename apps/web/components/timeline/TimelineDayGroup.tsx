import type { ReactNode } from 'react';

const DAY = 86_400_000;

/** Day bucket (UTC) used to group entries. */
export function dayKey(ms: number): number {
  return Math.floor(ms / DAY);
}

export function dayLabel(key: number, now: number = Date.now()): string {
  const today = dayKey(now);
  if (key === today) return 'Today';
  if (key === today - 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(key * DAY))
    .replace(',', '');
}

export function TimelineDayGroup({ dayKey: key, children }: { dayKey: number; children: ReactNode }) {
  return (
    <li className="list-none">
      <h3 className="sticky top-0 z-10 bg-background/90 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span suppressHydrationWarning>{dayLabel(key)}</span>
      </h3>
      <ul className="space-y-2">{children}</ul>
    </li>
  );
}
