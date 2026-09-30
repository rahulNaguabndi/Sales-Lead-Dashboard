'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatRelative } from '@/lib/format';

/** Relative time with the absolute 24 h timestamp as tooltip; refreshes every 60 s. */
export function RelativeTime({ at, className }: { at: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={formatDateTime(at)}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(at, now)}
    </time>
  );
}
