import { stageLabel, type Stage } from '@leaddesk/shared';
import { STAGE_COLORS, STAGE_DOT_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';

export function StageChip({ stage }: { stage: Stage }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        STAGE_COLORS[stage],
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', STAGE_DOT_COLORS[stage])} />
      {stageLabel(stage)}
    </span>
  );
}
