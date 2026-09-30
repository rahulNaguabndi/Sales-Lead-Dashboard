import { slaStatus, type SlaInput } from '@leaddesk/shared';
import { cn } from '@/lib/utils';

const MINUTE = 60_000;

/** First-response SLA chip. Renders nothing once the lead is contacted or past NEW. */
export function SlaBadge({
  lead,
  now = Date.now(),
  className,
}: {
  lead: SlaInput;
  now?: number;
  className?: string;
}) {
  const { status, deadline } = slaStatus(lead, now);
  if (status === 'NA' || status === 'OK' || deadline === null) return null;
  if (status === 'BREACHED') {
    const over = Math.max(1, Math.floor((now - deadline) / MINUTE));
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800',
          className,
        )}
      >
        SLA breached · {over} min over
      </span>
    );
  }
  const left = Math.max(1, Math.ceil((deadline - now) / MINUTE));
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 motion-safe:animate-pulse',
        className,
      )}
    >
      Respond now · {left} min left
    </span>
  );
}
