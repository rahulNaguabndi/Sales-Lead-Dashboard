import { describe, expect, it } from 'vitest';
import { validateDraft, validateSuggest } from '@/server/services/ai/validate';
import { makeCtx } from './fixture';

const offer = { id: 'o1', title: 't', description: '', reasons: [] };
const sugg = (offerId: string | null) => ({
  summary: 's',
  nextBestAction: { action: 'SEND_OFFER' as const, channel: 'WHATSAPP' as const, timing: 'now', reason: 'r', offerId },
  confidence: 'high' as const,
});
const draft = (over = {}) => ({
  channel: 'WHATSAPP' as const,
  language: 'it',
  subject: null,
  body: 'Ciao Giulia',
  offerId: null,
  ...over,
});

describe('validateSuggest', () => {
  it('drops unknown offer ids', () => {
    expect(validateSuggest(sugg('zzz'), makeCtx({ offers: [offer] })).nextBestAction.offerId).toBeNull();
  });
  it('keeps matched offer ids', () => {
    expect(validateSuggest(sugg('o1'), makeCtx({ offers: [offer] })).nextBestAction.offerId).toBe('o1');
  });
});

describe('validateDraft', () => {
  it('rejects wrong language', () => {
    expect(validateDraft(draft({ language: 'en' }), makeCtx(), 'WHATSAPP')).toBeNull();
  });
  it('enforces body limits', () => {
    expect(validateDraft(draft({ body: 'x'.repeat(601) }), makeCtx(), 'WHATSAPP')).toBeNull();
    const email = draft({ channel: 'EMAIL', subject: 'Hi', body: 'x'.repeat(1000) });
    expect(validateDraft(email, makeCtx(), 'EMAIL')).not.toBeNull();
    expect(validateDraft({ ...email, body: 'x'.repeat(1001) }, makeCtx(), 'EMAIL')).toBeNull();
  });
  it('requires an email subject and matching channel', () => {
    expect(validateDraft(draft({ channel: 'EMAIL', subject: null }), makeCtx(), 'EMAIL')).toBeNull();
    expect(validateDraft(draft({ channel: 'SMS' }), makeCtx(), 'WHATSAPP')).toBeNull();
  });
  it('nulls offers that were not matched', () => {
    expect(validateDraft(draft({ offerId: 'x' }), makeCtx(), 'WHATSAPP')?.offerId).toBeNull();
  });
});
