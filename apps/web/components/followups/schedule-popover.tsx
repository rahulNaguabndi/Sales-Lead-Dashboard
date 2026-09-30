'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { scheduleFollowUp } from './api';
import { FOLLOW_UP_PICKS, resolveFollowUpPick, type FollowUpPickKey } from './quick-picks';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Quick picks schedule in one click; "Custom" reveals a local date-time field. */
export function SchedulePopover({
  leadId,
  onScheduled,
  onClose,
}: {
  leadId: string;
  onScheduled: () => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(new Date(Date.now() + 3_600_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (at: Date) => {
    if (at.getTime() <= Date.now()) {
      setError('Pick a future time');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await scheduleFollowUp(leadId, at.getTime());
      onScheduled();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Schedule follow-up"
      data-testid="schedule-popover"
      className="mt-2 space-y-2 rounded-md border border-border bg-card p-2"
    >
      <div className="flex flex-wrap gap-1">
        {FOLLOW_UP_PICKS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void submit(resolveFollowUpPick(p.key as FollowUpPickKey))}
          >
            {p.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setCustom((v) => !v)}>
          Custom
        </Button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            aria-label="Follow-up date and time"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button size="sm" disabled={busy || !value} onClick={() => void submit(new Date(value))}>
            Schedule
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
