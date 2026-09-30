'use client';

import { formatDateTime, formatRelative } from '@/lib/format';

/** Short relative time ("3 hours ago"); the exact date-time is in the tooltip. */
export function RelativeTime({ at, now }: { at: number; now?: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={formatDateTime(at)} suppressHydrationWarning>
      {formatRelative(at, now)}
    </time>
  );
}

/** Lead age as "2 h" / "3 d". */
export function formatAge(createdAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
