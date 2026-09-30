'use client';

import { useLiveState } from '@/lib/sse/useLiveEvents';
import type { LiveStatus } from '@/lib/sse/liveStore';

const VIEW: Record<LiveStatus, { label: string; dot: string; tip: string }> = {
  live: { label: 'Live', dot: 'bg-emerald-500', tip: 'Receiving live updates' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-amber-500', tip: 'Connection lost, retrying' },
  offline: { label: 'Offline', dot: 'bg-slate-500', tip: 'Offline: refreshing every 30 s' },
};

export function LiveStatusDot() {
  const { status } = useLiveState();
  const v = VIEW[status];
  return (
    <span
      role="status"
      title={v.tip}
      data-status={status}
      className="flex items-center gap-1.5 text-xs text-slate-400"
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${v.dot}`} />
      {v.label}
    </span>
  );
}
