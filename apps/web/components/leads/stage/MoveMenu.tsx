'use client';

import { STAGES, STAGE_LABELS, allowedTargets, type Role, type Stage } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Keyboard/touch alternative to dragging: "Move to…" with only valid targets enabled. */
export function MoveMenu({
  open,
  from,
  name,
  role,
  onPick,
  onClose,
}: {
  open: boolean;
  from: Stage;
  name: string;
  role: Role;
  onPick: (to: Stage) => void;
  onClose: () => void;
}) {
  const ok = new Set(allowedTargets(from, role));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to…</DialogTitle>
          <DialogDescription>
            {name} is in {STAGE_LABELS[from]}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="menu">
          {STAGES.filter((s) => s !== from).map((s) => (
            <Button
              key={s}
              role="menuitem"
              variant="outline"
              disabled={!ok.has(s)}
              title={ok.has(s) ? undefined : `Not allowed from ${STAGE_LABELS[from]}`}
              onClick={() => onPick(s)}
            >
              {STAGE_LABELS[s]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
