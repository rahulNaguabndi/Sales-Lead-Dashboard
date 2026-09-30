'use client';

import { useState } from 'react';
import { FOLLOW_UP_NOTE_MAX_LENGTH } from '@leaddesk/shared';
import { cn } from '@/lib/utils';
import { QUICK_PICKS, resolveQuickPick, type QuickPickKey } from './quick-picks';

export type FollowUpValue = { dueAt: string; note?: string } | undefined;

export type FollowUpPickerProps = {
  value: FollowUpValue;
  onChange: (value: FollowUpValue) => void;
  error?: string;
  disabled?: boolean;
};

/** "datetime-local" expects local time without a zone. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function FollowUpPicker({ value, onChange, error, disabled }: FollowUpPickerProps) {
  const [enabled, setEnabled] = useState(Boolean(value));
  const [pick, setPick] = useState<QuickPickKey | null>(null);

  const setDate = (d: Date | null, note = value?.note) => {
    onChange(d ? { dueAt: d.toISOString(), note } : undefined);
  };

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) {
              setPick(null);
              onChange(undefined);
            }
          }}
        />
        Schedule follow-up
      </label>
      {enabled ? (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Follow-up time">
            {QUICK_PICKS.map((q) => (
              <button
                key={q.key}
                type="button"
                aria-pressed={pick === q.key}
                onClick={() => {
                  setPick(q.key);
                  if (q.key !== 'custom') setDate(resolveQuickPick(q.key));
                }}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs',
                  pick === q.key
                    ? 'border-blue-600 bg-blue-600/15 text-blue-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          {pick === 'custom' || (value && pick === null) ? (
            <input
              type="datetime-local"
              aria-label="Follow-up date and time"
              value={value ? toLocalInput(new Date(value.dueAt)) : ''}
              onChange={(e) => setDate(e.target.value ? new Date(e.target.value) : null)}
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm"
            />
          ) : null}
          {value ? (
            <p className="text-xs text-slate-400">
              Due{' '}
              {new Date(value.dueAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          ) : null}
          <input
            type="text"
            aria-label="Follow-up note"
            placeholder="Follow-up note (optional)"
            maxLength={FOLLOW_UP_NOTE_MAX_LENGTH}
            value={value?.note ?? ''}
            disabled={!value}
            onChange={(e) => value && onChange({ ...value, note: e.target.value || undefined })}
            className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm"
          />
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
