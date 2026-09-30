import { describe, expect, it } from 'vitest';
import {
  EMPTY_FIELDS,
  applyPrefill,
  focusTargetAfterPrefill,
  resetAfterSave,
} from '@/components/leads/composer/composer-state';

describe('composer prefill', () => {
  it('fills type, note and the AI-assisted flag (F14/F18)', () => {
    const s = applyPrefill(EMPTY_FIELDS, { type: 'WHATSAPP', note: 'Hi Marco', aiAssisted: true });
    expect(s).toEqual({ type: 'WHATSAPP', outcome: '', note: 'Hi Marco', aiAssisted: true });
  });
  it('keeps existing fields that are not prefilled', () => {
    const s = applyPrefill(
      { type: 'CALL', outcome: 'CONNECTED', note: 'typed', aiAssisted: false },
      { aiAssisted: true },
    );
    expect(s).toEqual({ type: 'CALL', outcome: 'CONNECTED', note: 'typed', aiAssisted: true });
  });
  it('drops the outcome for Note and when the type changes', () => {
    expect(applyPrefill({ ...EMPTY_FIELDS, outcome: 'CONNECTED' }, { type: 'NOTE' }).outcome).toBe(
      '',
    );
    expect(applyPrefill({ ...EMPTY_FIELDS, outcome: 'CONNECTED' }, { type: 'SMS' }).outcome).toBe(
      '',
    );
  });
  it('a hand-edited prefill without the flag clears aiAssisted', () => {
    expect(applyPrefill({ ...EMPTY_FIELDS, aiAssisted: true }, { note: 'mine' }).aiAssisted).toBe(
      false,
    );
  });
  it('reset keeps the type only', () => {
    expect(
      resetAfterSave({ type: 'EMAIL', outcome: 'VOICEMAIL', note: 'x', aiAssisted: true }),
    ).toEqual({
      ...EMPTY_FIELDS,
      type: 'EMAIL',
    });
  });
  it('focus goes to the outcome when a contact draft has no outcome yet', () => {
    expect(focusTargetAfterPrefill({ type: 'WHATSAPP', note: 'draft' })).toBe('outcome');
    expect(focusTargetAfterPrefill({ type: 'NOTE', note: 'draft' })).toBe('note');
    expect(focusTargetAfterPrefill({ type: 'CALL', outcome: 'CONNECTED' })).toBe('note');
  });
});
