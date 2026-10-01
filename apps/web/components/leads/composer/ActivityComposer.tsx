'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  NOTE_MAX_LENGTH,
  USER_ACTIVITY_TYPES,
  CreateActivitySchema,
  type Role,
  type Stage,
} from '@leaddesk/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { resetAfterSave } from './composer-state';
import {
  CompleteFollowUpCheckbox,
  isDueTodayOrEarlier,
  type PendingFollowUp,
} from './CompleteFollowUpCheckbox';
import { FollowUpPicker, type FollowUpValue } from './FollowUpPicker';
import { OutcomeSelect } from './OutcomeSelect';
import { StageSelect } from './StageSelect';
import { TypeSegmentedControl } from './TypeSegmentedControl';
import { ComposerProvider, useOptionalComposer } from './useComposer';
import { ApiRequestError, useLogActivity } from './useLogActivity';
import { useRefresh } from '@/components/leads/assign/useRefresh';

export type ActivityComposerProps = {
  lead: { id: string; stage: Stage; version: number; ownerId: string | null };
  currentUser: { id: string; name: string; role: Role };
  /** From F05's permissions object (F03-derived); defaults to allowed, the server decides. */
  permissions?: { canLogActivity?: boolean };
  pendingFollowUp?: PendingFollowUp | null;
  onCloseLead?: () => void;
};

export function ActivityComposer(props: ActivityComposerProps) {
  const existing = useOptionalComposer();
  if (existing) return <ComposerBody {...props} />;
  return (
    <ComposerProvider>
      <ComposerBody {...props} />
    </ComposerProvider>
  );
}

function ComposerBody({
  lead,
  currentUser,
  permissions,
  pendingFollowUp,
  onCloseLead,
}: ActivityComposerProps) {
  const composer = useOptionalComposer()!;
  const refresh = useRefresh();
  const { fields, setFields, expanded, setExpanded, noteRef, outcomeRef } = composer;
  const [followUp, setFollowUp] = useState<FollowUpValue>(undefined);
  const [stageTo, setStageTo] = useState<Stage | ''>('');
  const [completeFollowUp, setCompleteFollowUp] = useState(
    pendingFollowUp ? isDueTodayOrEarlier(pendingFollowUp.dueAt) : false,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const closed = lead.stage === 'WON' || lead.stage === 'LOST';
  // UI hint only (F05 permissions object, from F03); the server re-authorizes every request.
  const canLog = permissions?.canLogActivity ?? true;

  const { submit, isPending } = useLogActivity({
    leadId: lead.id,
    currentUser,
    onError: (err) => {
      setServerError(
        err instanceof ApiRequestError && err.status === 409
          ? err.message
          : err instanceof ApiRequestError
            ? err.message
            : null,
      );
    },
  });

  const candidate = useMemo(
    () => ({
      clientRequestId: '00000000000000000000000000',
      type: closed ? ('NOTE' as const) : fields.type,
      outcome: fields.type === 'NOTE' || closed ? undefined : fields.outcome || undefined,
      note: fields.note,
      aiAssisted: fields.aiAssisted,
      nextFollowUp: followUp,
      completeFollowUpId: pendingFollowUp && completeFollowUp ? pendingFollowUp.id : undefined,
      stageChange: stageTo ? { to: stageTo } : undefined,
      expectedVersion: stageTo ? lead.version : undefined,
    }),
    [fields, closed, followUp, pendingFollowUp, completeFollowUp, stageTo, lead.version],
  );

  // FR-012: the same schema the server uses. The placeholder id is a valid ULID shape.
  const parsed = useMemo(
    () => CreateActivitySchema.safeParse({ ...candidate, clientRequestId: '0'.repeat(26) }),
    [candidate],
  );
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const i of parsed.error.issues) errors[i.path.join('.')] ??= i.message;
  }
  const noteLength = fields.note.length;
  const overLimit = noteLength > NOTE_MAX_LENGTH;
  const hasText = fields.note.trim().length > 0;
  const canSubmit = parsed.success && !isPending;
  // A disabled button must say why (FR-012 errors, phrased as the next step).
  const hint = parsed.success
    ? null
    : errors.note || !hasText
      ? overLimit
        ? `Shorten the note to ${NOTE_MAX_LENGTH} characters`
        : 'Write a note to log this activity'
      : errors.outcome
        ? 'Pick an outcome'
        : errors['nextFollowUp.dueAt']
          ? 'Fix the follow-up date'
          : (Object.values(errors)[0] ?? null);

  if (!canLog) {
    return (
      <div
        role="note"
        className="rounded-md border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-300"
      >
        Claim this lead to log activities
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          requestAnimationFrame(() => noteRef.current?.focus());
        }}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Log an activity…
      </button>
    );
  }

  const doSubmit = async () => {
    if (!canSubmit || !parsed.success) return;
    setServerError(null);
    const { clientRequestId: _ignored, ...input } = parsed.data;
    const res = await submit({
      ...input,
      nextFollowUp: input.nextFollowUp,
    });
    if (res) {
      // A stage move or follow-up change shows up in server-rendered parts (header, stage chip).
      if (input.stageChange || input.nextFollowUp || input.completeFollowUpId) refresh(lead.id);
      setFields(resetAfterSave);
      setFollowUp(undefined);
      setStageTo('');
      setCompleteFollowUp(false);
      setResetKey((k) => k + 1);
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName);
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void doSubmit();
    } else if (e.key === 'Escape') {
      if (fields.note.trim() && !window.confirm('Discard this entry?')) return;
      setFields(() => ({ ...resetAfterSave(fields), type: fields.type }));
      setExpanded(false);
    } else if (!typing && /^[1-7]$/.test(e.key) && !closed) {
      const type = USER_ACTIVITY_TYPES[Number(e.key) - 1]!;
      setFields((prev) => ({ ...prev, type, outcome: type === 'NOTE' ? '' : prev.outcome }));
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-slate-700 bg-slate-900 p-3"
      role="group"
      aria-label="Log an activity"
      onKeyDown={onKeyDown}
    >
      <TypeSegmentedControl
        value={closed ? 'NOTE' : fields.type}
        disabled={closed || isPending}
        onChange={(type) =>
          setFields((prev) => ({ ...prev, type, outcome: type === 'NOTE' ? '' : prev.outcome }))
        }
      />
      {closed ? (
        <p className="text-xs text-slate-400">This lead is closed. Only notes can be added.</p>
      ) : null}

      <OutcomeSelect
        ref={outcomeRef}
        type={closed ? 'NOTE' : fields.type}
        value={fields.outcome}
        onChange={(outcome) => setFields((prev) => ({ ...prev, outcome }))}
        error={hasText ? errors.outcome : undefined}
        disabled={isPending}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="composer-note" className="text-xs font-medium text-slate-400">
          Note
        </label>
        <Textarea
          id="composer-note"
          ref={noteRef}
          value={fields.note}
          disabled={isPending}
          rows={3}
          placeholder="What happened?"
          aria-invalid={overLimit}
          onChange={(e) => setFields((prev) => ({ ...prev, note: e.target.value }))}
        />
        <p
          className={cn('self-end text-xs', overLimit ? 'text-red-400' : 'text-slate-500')}
          aria-live="polite"
        >
          {noteLength} / {NOTE_MAX_LENGTH}
        </p>
      </div>

      <FollowUpPicker
        key={`fu-${resetKey}`}
        value={followUp}
        onChange={setFollowUp}
        error={errors['nextFollowUp.dueAt']}
        disabled={isPending}
      />
      {pendingFollowUp ? (
        <CompleteFollowUpCheckbox
          followUp={pendingFollowUp}
          checked={completeFollowUp}
          onChange={setCompleteFollowUp}
          disabled={isPending}
        />
      ) : null}
      {!closed ? (
        <StageSelect
          current={lead.stage}
          role={currentUser.role}
          value={stageTo}
          onChange={setStageTo}
          onCloseLead={onCloseLead}
          disabled={isPending}
        />
      ) : null}

      {serverError ? (
        <p role="alert" className="text-sm text-red-400">
          {serverError}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500" id="composer-hint" aria-live="polite">
          {hint && !isPending ? hint : 'Ctrl/⌘+Enter to log'}
        </span>
        <Button
          type="button"
          onClick={() => void doSubmit()}
          disabled={!canSubmit}
          aria-describedby="composer-hint"
        >
          {isPending ? 'Saving…' : 'Log activity'}
        </Button>
      </div>
    </div>
  );
}
