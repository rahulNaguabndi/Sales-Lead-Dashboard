'use client';

import { forwardRef } from 'react';
import { OUTCOMES, type Outcome, type UserActivityType } from '@leaddesk/shared';

export const OUTCOME_LABELS: Record<Outcome, string> = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  VOICEMAIL: 'Voicemail',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CALLBACK_REQUESTED: 'Callback requested',
};

export type OutcomeSelectProps = {
  type: UserActivityType;
  value: Outcome | '';
  onChange: (outcome: Outcome | '') => void;
  error?: string;
  disabled?: boolean;
};

/** Hidden for Note; required for contact types; optional for Meeting / Test drive. */
export const OutcomeSelect = forwardRef<HTMLSelectElement, OutcomeSelectProps>(
  function OutcomeSelect({ type, value, onChange, error, disabled }, ref) {
    if (type === 'NOTE') return null;
    const optional = type === 'MEETING' || type === 'TEST_DRIVE';
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor="composer-outcome" className="text-xs font-medium text-slate-400">
          Outcome{optional ? ' (optional)' : ''}
        </label>
        <select
          id="composer-outcome"
          ref={ref}
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value as Outcome | '')}
          className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select outcome…</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}
            </option>
          ))}
        </select>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  },
);
