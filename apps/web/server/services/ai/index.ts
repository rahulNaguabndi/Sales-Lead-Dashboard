import type { Channel } from '@leaddesk/shared';
import type { CurrentUser } from '../../policy';
import { AppError } from '../../http/errors';
import { getLeadDetail, listActivities } from '../lead-detail';
import { getOffersForLead } from '../offer-matcher';
import { getOrGenerate, takeRateLimit } from './cache';
import { buildLeadContext, type LeadAiContext } from './context';
import { fingerprint } from './fingerprint';
import { generateDraft, generateSuggest, logGeneration, type AiDeps } from './generate';
import { getAiClient } from './client';
import { ruleDraft, ruleSuggest } from './rules';
import type { DraftResponse, FallbackReason, SuggestResponse } from './schemas';

export class LeadClosedError extends AppError {
  readonly statusCode = 409;
  readonly code = 'LEAD_CLOSED';
  constructor() {
    super('AI drafts are not available for closed leads');
  }
}

export type AiServiceDeps = AiDeps & {
  /** Test seam: skip the read models and use a prebuilt context. */
  loadContext?: (user: CurrentUser, leadId: string) => Promise<LeadAiContext>;
  rateLimit?: number;
};

export async function loadLeadContext(user: CurrentUser, leadId: string): Promise<LeadAiContext> {
  const detail = await getLeadDetail(user, leadId);
  const [page, offers] = await Promise.all([
    listActivities(user, leadId, { order: 'desc', limit: 15 }),
    getOffersForLead(leadId),
  ]);
  return buildLeadContext({ detail, activities: page.items, offers, repName: user.name });
}

function limitPerHour(deps: AiServiceDeps): number {
  return deps.rateLimit ?? Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 30);
}

/** Runs the rate limiter only when a real model call is about to happen. */
async function gate(user: CurrentUser, deps: AiServiceDeps) {
  const hasClient = deps.client === undefined ? getAiClient() !== null : deps.client !== null;
  if (!hasClient) return { allowed: true, minutesLeft: 0 };
  return takeRateLimit(user.id, limitPerHour(deps));
}

export async function suggestForLead(
  user: CurrentUser,
  leadId: string,
  opts: { regenerate?: boolean } = {},
  deps: AiServiceDeps = {},
): Promise<SuggestResponse> {
  const ctx = await (deps.loadContext ?? loadLeadContext)(user, leadId);
  const fp = fingerprint(ctx);
  const now = deps.now ?? Date.now();

  if (ctx.stage === 'WON' || ctx.stage === 'LOST') {
    return {
      ...ruleSuggest(ctx),
      nextBestAction: { ...ruleSuggest(ctx).nextBestAction, timing: 'No action: closed' },
      source: 'RULES',
      cached: false,
      generatedAt: now,
      fingerprint: fp,
    };
  }

  const { value, cached } = await getOrGenerate<SuggestResponse>(
    'suggest',
    leadId,
    fp,
    async () => {
      const g = await gate(user, deps);
      if (!g.allowed) {
        const value: SuggestResponse = {
          ...ruleSuggest(ctx),
          source: 'RULES',
          cached: false,
          generatedAt: now,
          fingerprint: fp,
          fallbackReason: 'RATE_LIMITED' as FallbackReason,
          retryAfterMinutes: g.minutesLeft,
        };
        return { value, cacheable: false };
      }
      const value = await generateSuggest(ctx, fp, deps);
      return { value, cacheable: value.source === 'AI' };
    },
    { bypass: opts.regenerate },
  );
  if (cached) {
    logGeneration({ leadId, kind: 'suggest', latencyMs: 0, cacheHit: true, source: value.source });
  }
  return { ...value, cached };
}

export async function draftForLead(
  user: CurrentUser,
  leadId: string,
  channel: Exclude<Channel, 'CALL'>,
  opts: { regenerate?: boolean } = {},
  deps: AiServiceDeps = {},
): Promise<DraftResponse> {
  const ctx = await (deps.loadContext ?? loadLeadContext)(user, leadId);
  if (ctx.stage === 'WON' || ctx.stage === 'LOST') throw new LeadClosedError();
  const fp = fingerprint(ctx, channel);
  const now = deps.now ?? Date.now();

  const { value, cached } = await getOrGenerate<DraftResponse>(
    'draft',
    leadId,
    fp,
    async () => {
      const g = await gate(user, deps);
      if (!g.allowed) {
        const value: DraftResponse = {
          ...ruleDraft(ctx, channel),
          source: 'RULES',
          cached: false,
          generatedAt: now,
          fingerprint: fp,
          fallbackReason: 'RATE_LIMITED',
          retryAfterMinutes: g.minutesLeft,
        };
        return { value, cacheable: false };
      }
      const value = await generateDraft(ctx, channel, fp, deps);
      return { value, cacheable: value.source === 'AI' };
    },
    { bypass: opts.regenerate },
  );
  if (cached) {
    logGeneration({ leadId, kind: 'draft', latencyMs: 0, cacheHit: true, source: value.source });
  }
  return { ...value, cached };
}
