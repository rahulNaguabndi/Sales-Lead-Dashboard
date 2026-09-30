'use client';

import { useEffect, useState } from 'react';
import { LOST_REASONS, type LostReason } from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export type LostData = { lostReason: LostReason; lostNote: string | null };

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE: 'Price',
  BOUGHT_ELSEWHERE: 'Bought elsewhere',
  NOT_READY: 'Not ready',
  UNREACHABLE: 'Unreachable',
  FINANCING_DECLINED: 'Financing declined',
  OTHER: 'Other',
};

type Props = {
  open: boolean;
  onConfirm: (data: LostData) => Promise<string | null>;
  onCancel: () => void;
};

export function LostDialog({ open, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
      setServerError(null);
    }
  }, [open]);

  const trimmed = note.trim();
  const noteInvalid = reason === 'OTHER' && (trimmed.length < 3 || trimmed.length > 500);
  const invalid = reason === null || noteInvalid;

  async function submit() {
    if (!reason || noteInvalid) return;
    setBusy(true);
    const err = await onConfirm({ lostReason: reason, lostNote: trimmed || null });
    setBusy(false);
    if (err) setServerError(err);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close as lost</DialogTitle>
          <DialogDescription>Why was this lead lost?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="sr-only">Lost reason</legend>
            {LOST_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="lost-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {LOST_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <label htmlFor="lost-note" className="text-sm font-medium">
              Note{reason === 'OTHER' ? ' (required, 3–500 characters)' : ' (optional)'}
            </label>
            <Textarea
              id="lost-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={noteInvalid}
            />
            {noteInvalid && (
              <p role="alert" className="text-xs text-red-400">
                Add a note of at least 3 characters
              </p>
            )}
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-red-400">
              {serverError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={invalid || busy}>
            Confirm loss
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
