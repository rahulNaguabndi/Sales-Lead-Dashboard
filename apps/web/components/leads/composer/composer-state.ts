import type { Outcome, UserActivityType } from '@leaddesk/shared';

export type ComposerFields = {
  type: UserActivityType;
  outcome: Outcome | '';
  note: string;
  aiAssisted: boolean;
};

export type ComposerPrefill = {
  type?: UserActivityType;
  note?: string;
  outcome?: Outcome;
  aiAssisted?: boolean;
};

export const EMPTY_FIELDS: ComposerFields = {
  type: 'CALL',
  outcome: '',
  note: '',
  aiAssisted: false,
};

/** Applies a prefill from F14 (channels) or F18 (AI assist). Unspecified fields are kept. */
export function applyPrefill(state: ComposerFields, p: ComposerPrefill): ComposerFields {
  const type = p.type ?? state.type;
  // A NOTE never carries an outcome.
  const outcome = type === 'NOTE' ? '' : (p.outcome ?? (p.type ? '' : state.outcome));
  return {
    type,
    outcome,
    note: p.note ?? state.note,
    aiAssisted: p.aiAssisted ?? (p.note !== undefined ? false : state.aiAssisted),
  };
}

/** After a successful save: clear the text and outcome but keep the chosen type. */
export function resetAfterSave(state: ComposerFields): ComposerFields {
  return { ...EMPTY_FIELDS, type: state.type };
}

/** Which element should receive focus after a prefill. */
export function focusTargetAfterPrefill(p: ComposerPrefill): 'outcome' | 'note' {
  return p.note !== undefined && p.type !== 'NOTE' && p.outcome === undefined ? 'outcome' : 'note';
}
