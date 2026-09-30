import type { Priority } from '@leaddesk/shared';
import { cn } from '@/lib/utils';

const DOT: Record<Priority, string> = {
  HOT: 'bg-red-500',
  WARM: 'bg-amber-400',
  COOL: 'bg-sky-400',
};

/** Colour plus accessible text: colour is never the only signal. */
export function PriorityDot({ priority, score }: { priority: Priority; score?: number }) {
  const label = `${priority}${score === undefined ? '' : ` ${score}`}`;
  return (
    <span title={label} className="inline-flex items-center">
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', DOT[priority])} />
      <span className="sr-only">{label} priority</span>
    </span>
  );
}
