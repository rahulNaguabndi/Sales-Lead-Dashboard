import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDraft, generateSuggest } from '@/server/services/ai/generate';
import { getOrGenerate, resetAiCache } from '@/server/services/ai/cache';
import { fingerprint } from '@/server/services/ai/fingerprint';
import { suggestForLead } from '@/server/services/ai';
import { makeCtx } from './fixture';

const goodSuggest = {
  summary: 'Giulia wants an E3.',
  nextBestAction: { action: 'WHATSAPP', channel: 'WHATSAPP', timing: 'Now', reason: 'Warm lead', offerId: null },
  confidence: 'high',
};

function client(parse: (args: Record<string, unknown>) => unknown) {
  return { messages: { parse: vi.fn(async (a: Record<string, unknown>) => parse(a)) } } as never;
}
const ok = (parsed: unknown, stop = 'end_turn') => ({
  stop_reason: stop,
  parsed_output: parsed,
  usage: { input_tokens: 10, output_tokens: 5 },
});

const run = (c: unknown) => generateSuggest(makeCtx(), 'fp', { client: c as never, model: 'm', effort: 'low' });

afterEach(() => {
  resetAiCache();
  vi.restoreAllMocks();
});

describe('generateSuggest', () => {
  it('no key -> NO_API_KEY rules', async () => {
    const r = await generateSuggest(makeCtx(), 'fp', { client: null });
    expect(r).toMatchObject({ source: 'RULES', fallbackReason: 'NO_API_KEY' });
  });
  it('success returns AI output', async () => {
    const r = await run(client(() => ok(goodSuggest)));
    expect(r).toMatchObject({ source: 'AI', model: 'm' });
  });
  it.each([
    ['timeout', () => { throw new Anthropic.APIConnectionTimeoutError(); }, 'TIMEOUT'],
    ['api error', () => { throw new Anthropic.APIError(500, undefined, 'x', undefined); }, 'API_ERROR'],
    ['refusal', () => ok(null, 'refusal'), 'REFUSAL'],
    ['max_tokens', () => ok(null, 'max_tokens'), 'MAX_TOKENS'],
    ['null parsed', () => ok(null), 'INVALID_OUTPUT'],
    ['post-validation failure', () => ok({ ...goodSuggest, summary: 'x'.repeat(700) }), 'INVALID_OUTPUT'],
  ])('%s -> %s fallback', async (_n, fn, reason) => {
    const r = await run(client(fn as never));
    expect(r).toMatchObject({ source: 'RULES', fallbackReason: reason });
  });
  it('request shape: no thinking/budget/prefill, max_tokens 2000, effort from settings', async () => {
    const c = client(() => ok(goodSuggest));
    await run(c);
    const args = (c as { messages: { parse: { mock: { calls: Record<string, unknown>[][] } } } }).messages.parse.mock.calls[0]![0]!;
    expect(args.thinking).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain('budget_tokens');
    expect(args.max_tokens).toBe(2000);
    expect((args.output_config as { effort: string }).effort).toBe('low');
    const msgs = args.messages as { role: string }[];
    expect(msgs.every((m) => m.role === 'user')).toBe(true);
  });
  it('never logs prompt or completion text', async () => {
    const w = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await run(client(() => ok(goodSuggest)));
    const logged = w.mock.calls.map((x) => String(x[0])).join('');
    expect(logged).toContain('ai generation');
    expect(logged).not.toContain('Giulia');
    expect(logged).not.toContain('Warm lead');
  });
});

describe('generateDraft', () => {
  const goodDraft = { channel: 'WHATSAPP', language: 'it', subject: null, body: 'Ciao Giulia!', offerId: null };
  it('uses max_tokens 1500 and returns the draft', async () => {
    const c = client(() => ok(goodDraft));
    const r = await generateDraft(makeCtx(), 'WHATSAPP', 'fp', { client: c as never, model: 'm' });
    expect(r.source).toBe('AI');
    expect(r.draft.body).toBe('Ciao Giulia!');
    const args = (c as { messages: { parse: { mock: { calls: Record<string, unknown>[][] } } } }).messages.parse.mock.calls[0]![0]!;
    expect(args.max_tokens).toBe(1500);
  });
  it('wrong-language draft falls back to the template', async () => {
    const c = client(() => ok({ ...goodDraft, language: 'en' }));
    const r = await generateDraft(makeCtx(), 'WHATSAPP', 'fp', { client: c as never });
    expect(r).toMatchObject({ source: 'RULES', fallbackReason: 'INVALID_OUTPUT' });
    expect(r.draft.language).toBe('it');
  });
});

describe('suggestForLead service (mocked model)', () => {
  const user = { id: 'u1', name: 'Sofia Rossi', role: 'REP', teamId: 't' } as never;
  const mk = (over = {}) => makeCtx(over);

  it('caches unchanged leads, regenerates on new activity and on demand', async () => {
    const c = client(() => ok(goodSuggest));
    const parse = (c as { messages: { parse: ReturnType<typeof vi.fn> } }).messages.parse;
    const base = { client: c as never, rateLimit: 1000 };
    const a = await suggestForLead(user, 'lead1', {}, { ...base, loadContext: async () => mk() });
    const b = await suggestForLead(user, 'lead1', {}, { ...base, loadContext: async () => mk() });
    expect([a.cached, b.cached]).toEqual([false, true]);
    expect(parse).toHaveBeenCalledTimes(1);
    const changed = mk({ meta: { leadId: 'lead1', version: 4, lastActivityAt: Date.now() } });
    await suggestForLead(user, 'lead1', {}, { ...base, loadContext: async () => changed });
    expect(parse).toHaveBeenCalledTimes(2);
    const r = await suggestForLead(user, 'lead1', { regenerate: true }, { ...base, loadContext: async () => changed });
    expect(r.cached).toBe(false);
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it('summary covers who, what, history and stage (rules)', async () => {
    const r = await suggestForLead(user, 'lead1', {}, { client: null, loadContext: async () => mk() });
    expect(r.summary).toMatch(/Giulia/);
    expect(r.summary).toMatch(/EuroDrive E3/);
    expect(r.summary).toMatch(/Stage CONTACTED/);
  });

  it('rate limit returns rules with RATE_LIMITED and does not call the model', async () => {
    const c = client(() => ok(goodSuggest));
    const parse = (c as { messages: { parse: ReturnType<typeof vi.fn> } }).messages.parse;
    const deps = { client: c as never, rateLimit: 1 };
    await suggestForLead(user, 'l-a', {}, { ...deps, loadContext: async () => mk({ meta: { leadId: 'l-a', version: 1, lastActivityAt: 1 } }) });
    const r = await suggestForLead(user, 'l-b', {}, { ...deps, loadContext: async () => mk({ meta: { leadId: 'l-b', version: 1, lastActivityAt: 1 } }) });
    expect(r.fallbackReason).toBe('RATE_LIMITED');
    expect(r.retryAfterMinutes).toBeGreaterThan(0);
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

void getOrGenerate;
void fingerprint;
