import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ZodType } from 'zod';
import type { Channel } from '@leaddesk/shared';
import { getAiClient } from './client';
import type { LeadAiContext } from './context';
import { buildUserMessage, SYSTEM_PROMPT } from './prompts';
import { ruleDraft, ruleSuggest } from './rules';
import {
  DraftSchema,
  SuggestSchema,
  type DraftResponse,
  type FallbackReason,
  type SuggestResponse,
} from './schemas';
import { validateDraft, validateSuggest } from './validate';

export type AiDeps = {
  client?: Anthropic | null;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  now?: number;
};

type Kind = 'suggest' | 'draft';
type CallResult<T> = { ok: true; output: T; tokens: number } | { ok: false; reason: FallbackReason };

function settings(deps: AiDeps) {
  return {
    client: deps.client === undefined ? getAiClient() : deps.client,
    model: deps.model ?? process.env.AI_MODEL ?? 'claude-opus-5-5',
    effort: (deps.effort ?? process.env.AI_EFFORT ?? 'low') as NonNullable<AiDeps['effort']>,
  };
}

/** Maps SDK errors most-specific-first. */
function mapError(err: unknown): FallbackReason {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'TIMEOUT';
  if (err instanceof Anthropic.RateLimitError) return 'API_ERROR';
  if (err instanceof Anthropic.APIError) return 'API_ERROR';
  return 'API_ERROR';
}

async function callModel<T>(
  deps: AiDeps,
  schema: ZodType<T>,
  maxTokens: number,
  userMessage: string,
): Promise<CallResult<T>> {
  const { client, model, effort } = settings(deps);
  if (!client) return { ok: false, reason: 'NO_API_KEY' };
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      output_config: { effort, format: zodOutputFormat(schema as never) },
    });
    if (res.stop_reason === 'refusal') return { ok: false, reason: 'REFUSAL' };
    if (res.stop_reason === 'max_tokens') return { ok: false, reason: 'MAX_TOKENS' };
    if (!res.parsed_output) return { ok: false, reason: 'INVALID_OUTPUT' };
    const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    return { ok: true, output: res.parsed_output as T, tokens };
  } catch (err) {
    return { ok: false, reason: mapError(err) };
  }
}

/** Structured log: ids, model, latency, tokens, source. Never prompt or completion text. */
export function logGeneration(entry: {
  leadId: string;
  kind: Kind;
  model?: string;
  latencyMs: number;
  tokens?: number;
  cacheHit: boolean;
  source: 'AI' | 'RULES';
  fallbackReason?: FallbackReason;
}): void {
  process.stdout.write(`${JSON.stringify({ level: 'info', message: 'ai generation', ...entry })}\n`);
}

export async function generateSuggest(
  ctx: LeadAiContext,
  fp: string,
  deps: AiDeps = {},
): Promise<SuggestResponse> {
  const started = Date.now();
  const { model } = settings(deps);
  const generatedAt = deps.now ?? Date.now();
  const fallback = (reason: FallbackReason): SuggestResponse => ({
    ...ruleSuggest(ctx),
    source: 'RULES',
    cached: false,
    generatedAt,
    fingerprint: fp,
    fallbackReason: reason,
  });
  const res = await callModel(deps, SuggestSchema, 2000, buildUserMessage(ctx, 'suggest'));
  let out: SuggestResponse;
  let tokens: number | undefined;
  if (!res.ok) out = fallback(res.reason);
  else {
    tokens = res.tokens;
    const checked = SuggestSchema.safeParse(validateSuggest(res.output, ctx));
    out = checked.success
      ? { ...checked.data, source: 'AI', model, cached: false, generatedAt, fingerprint: fp }
      : fallback('INVALID_OUTPUT');
  }
  logGeneration({
    leadId: ctx.meta.leadId,
    kind: 'suggest',
    model: out.source === 'AI' ? model : undefined,
    latencyMs: Date.now() - started,
    tokens,
    cacheHit: false,
    source: out.source,
    fallbackReason: out.fallbackReason,
  });
  return out;
}

export async function generateDraft(
  ctx: LeadAiContext,
  channel: Exclude<Channel, 'CALL'>,
  fp: string,
  deps: AiDeps = {},
): Promise<DraftResponse> {
  const started = Date.now();
  const { model } = settings(deps);
  const generatedAt = deps.now ?? Date.now();
  const fallback = (reason: FallbackReason): DraftResponse => ({
    ...ruleDraft(ctx, channel),
    source: 'RULES',
    cached: false,
    generatedAt,
    fingerprint: fp,
    fallbackReason: reason,
  });
  const res = await callModel(deps, DraftSchema, 1500, buildUserMessage(ctx, 'draft', channel));
  let out: DraftResponse;
  let tokens: number | undefined;
  if (!res.ok) out = fallback(res.reason);
  else {
    tokens = res.tokens;
    const draft = validateDraft(res.output, ctx, channel);
    out = draft
      ? { draft, source: 'AI', model, cached: false, generatedAt, fingerprint: fp }
      : fallback('INVALID_OUTPUT');
  }
  logGeneration({
    leadId: ctx.meta.leadId,
    kind: 'draft',
    model: out.source === 'AI' ? model : undefined,
    latencyMs: Date.now() - started,
    tokens,
    cacheHit: false,
    source: out.source,
    fallbackReason: out.fallbackReason,
  });
  return out;
}
