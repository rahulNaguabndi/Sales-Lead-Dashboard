import type { Priority } from '@leaddesk/shared';
import { PRIORITY_DOT_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

/** Colour plus accessible text: colour is never the only signal. */
export function PriorityDot({ priority, score }: { priority: Priority; score?: number }) {
  const label = `${priority}${score === undefined ? '' : ` ${score}`}`;
  return (
    <span title={label} className="inline-flex items-center">
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', PRIORITY_DOT_COLORS[priority])} />
      <span className="sr-only">{label} priority</span>
    </span>
  );
}
