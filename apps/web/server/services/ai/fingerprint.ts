import { createHash } from 'node:crypto';
import type { LeadAiContext } from './context';
import { PROMPT_VERSION } from './prompts';

/** Stable content hash: same lead state + offers + channel + prompt version gives the same key. */
export function fingerprint(ctx: LeadAiContext, channel?: string): string {
  const parts = [
    PROMPT_VERSION,
    ctx.meta.version,
    ctx.meta.lastActivityAt,
    ctx.offers.map((o) => o.id).sort(),
    channel ?? null,
  ];
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex');
}
