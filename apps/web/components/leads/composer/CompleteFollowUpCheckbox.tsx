'use client';

export type PendingFollowUp = { id: string; note: string | null; dueAt: number };

/** Pre-ticked when the lead has a pending follow-up due today (the composer sets the initial value). */
export function CompleteFollowUpCheckbox({
  followUp,
  checked,
  onChange,
  disabled,
}: {
  followUp: PendingFollowUp;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      Mark follow-up &lsquo;{followUp.note || 'Follow-up'}&rsquo; as done
    </label>
  );
}

/** True when the follow-up is due today (local time) or already overdue. */
export function isDueTodayOrEarlier(dueAt: number, now = new Date()): boolean {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return dueAt <= endOfToday.getTime();
}
