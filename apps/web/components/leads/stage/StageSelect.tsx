'use client';

import { useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { STAGES, STAGE_LABELS, allowedTargets, type Stage } from '@leaddesk/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STAGE_COLORS } from '@/components/ui/tokens';
import { cn } from '@/lib/utils';
import type { LeadSlotProps } from '@/components/leads/detail/types';
import { useStageChanger, type ChangeTarget } from './use-stage-changer';
import { useStageMutation } from './use-stage-mutation';

/** Stage chip + dropdown in the lead header (F07 `headerActions` slot). */
export function StageSelect({ lead, permissions, currentUser }: LeadSlotProps) {
  const { mutate, pending } = useStageMutation(lead.id);
  const send = useCallback((_l: ChangeTarget, body: Parameters<typeof mutate>[0]) => mutate(body), [mutate]);
  const { request, dialogs } = useStageChanger({ send });

  const isReopenable = lead.stage === 'LOST' && currentUser.role !== 'REP';
  const canAct = permissions.canChangeStage || isReopenable;
  const enabled = new Set<Stage>(allowedTargets(lead.stage, currentUser.role));
  const target: ChangeTarget = {
    id: lead.id,
    version: lead.version,
    stage: lead.stage,
    vehicleModel: lead.vehicleModel,
  };

  const chip = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        STAGE_COLORS[lead.stage],
      )}
    >
      Stage: {STAGE_LABELS[lead.stage]}
      {canAct && enabled.size > 0 && <ChevronDown aria-hidden className="h-3 w-3" />}
    </span>
  );

  if (!canAct || enabled.size === 0) return chip;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Change stage"
          disabled={pending}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chip}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {STAGES.filter((s) => s !== lead.stage).map((s) => {
            const ok = enabled.has(s);
            const label =
              lead.stage === 'LOST' && s === 'CONTACTED' ? 'Reopen (Contacted)' : STAGE_LABELS[s];
            return (
              <DropdownMenuItem
                key={s}
                disabled={!ok}
                title={ok ? undefined : `Not allowed from ${STAGE_LABELS[lead.stage]}`}
                onSelect={() => void request(target, s)}
              >
                {label}
                {!ok && <span className="sr-only"> (not allowed from {STAGE_LABELS[lead.stage]})</span>}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
