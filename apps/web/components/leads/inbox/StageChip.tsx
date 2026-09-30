import type { Stage } from '@leaddesk/shared';
import { STAGE_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

export function StageChip({ stage }: { stage: Stage }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        STAGE_COLORS[stage],
      )}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}
