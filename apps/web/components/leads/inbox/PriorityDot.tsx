import { priorityLabel, type Priority } from '@leaddesk/shared';
import { PRIORITY_DOT_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

/**
 * Colour plus accessible text: colour is never the only signal. Pass `decorative` when the same
 * priority and score are already printed next to the dot, so it isn't announced twice.
 */
export function PriorityDot({
  priority,
  score,
  decorative = false,
}: {
  priority: Priority;
  score?: number;
  decorative?: boolean;
}) {
  const label = `${priorityLabel(priority)} priority${score === undefined ? '' : `, score ${score}`}`;
  return (
    <span title={decorative ? undefined : label} className="inline-flex items-center">
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', PRIORITY_DOT_COLORS[priority])} />
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
