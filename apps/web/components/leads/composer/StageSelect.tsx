'use client';

import { OPEN_STAGES, TRANSITIONS, canTransition, type Role, type Stage } from '@leaddesk/shared';

export type StageSelectProps = {
  current: Stage;
  role: Role;
  value: Stage | '';
  onChange: (stage: Stage | '') => void;
  onCloseLead?: () => void;
  disabled?: boolean;
};

/** Open stages reachable from `current` for this role (WON/LOST/COLD are never offered). */
export function allowedStageTargets(current: Stage, role: Role): Stage[] {
  if (current === 'WON' || current === 'LOST') return [];
  return (OPEN_STAGES as readonly Stage[]).filter(
    (s) => s !== current && TRANSITIONS[current].includes(s) && canTransition(current, s, role),
  );
}

export function StageSelect({
  current,
  role,
  value,
  onChange,
  onCloseLead,
  disabled,
}: StageSelectProps) {
  const targets = allowedStageTargets(current, role);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="composer-stage" className="text-xs font-medium text-slate-400">
        Stage
      </label>
      <div className="flex items-center gap-3">
        <select
          id="composer-stage"
          value={value}
          disabled={disabled || targets.length === 0}
          onChange={(e) => onChange(e.target.value as Stage | '')}
          className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm"
        >
          <option value="">No change ({current})</option>
          {targets.map((s) => (
            <option key={s} value={s}>
              Move to {s}
            </option>
          ))}
        </select>
        <a
          href="#close-lead"
          className="text-xs text-blue-400 underline"
          onClick={(e) => {
            if (onCloseLead) {
              e.preventDefault();
              onCloseLead();
            }
          }}
        >
          Close lead…
        </a>
      </div>
    </div>
  );
}
