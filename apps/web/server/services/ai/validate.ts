import type { LeadAiContext } from './context';
import type { DraftOutput, SuggestOutput } from './schemas';

export const BODY_LIMIT = { WHATSAPP: 600, SMS: 600, EMAIL: 1000 } as const;

/** The model may only reference offers we gave it; anything else is dropped to null. */
export function validateSuggest(out: SuggestOutput, ctx: LeadAiContext): SuggestOutput {
  const ids = new Set(ctx.offers.map((o) => o.id));
  const offerId = out.nextBestAction.offerId;
  if (offerId && ids.has(offerId)) return out;
  return { ...out, nextBestAction: { ...out.nextBestAction, offerId: null } };
}

/** Returns null when the draft is unusable (caller falls back to a template). */
export function validateDraft(
  out: DraftOutput,
  ctx: LeadAiContext,
  channel: keyof typeof BODY_LIMIT,
): DraftOutput | null {
  if (out.channel !== channel) return null;
  if (out.language.toLowerCase() !== ctx.language.toLowerCase()) return null;
  const body = out.body.trim();
  if (!body || body.length > BODY_LIMIT[channel]) return null;
  if (channel === 'EMAIL' && !out.subject?.trim()) return null;
  const ids = new Set(ctx.offers.map((o) => o.id));
  return {
    ...out,
    body,
    subject: channel === 'EMAIL' ? (out.subject ?? null) : null,
    offerId: out.offerId && ids.has(out.offerId) ? out.offerId : null,
  };
}
