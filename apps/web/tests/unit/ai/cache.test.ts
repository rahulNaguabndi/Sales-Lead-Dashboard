import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrGenerate, resetAiCache, takeRateLimit } from '@/server/services/ai/cache';

beforeEach(() => resetAiCache());

describe('getOrGenerate', () => {
  it('second call is a hit and does not generate', async () => {
    const gen = vi.fn(async () => ({ value: { n: 1 }, cacheable: true }));
    const a = await getOrGenerate('suggest', 'l1', 'fp', gen);
    const b = await getOrGenerate('suggest', 'l1', 'fp', gen);
    expect(a.cached).toBe(false);
    expect(b).toEqual({ value: { n: 1 }, cached: true });
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it('single-flight: concurrent calls share one generation', async () => {
    const gen = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { value: 'x', cacheable: true };
    });
    await Promise.all([
      getOrGenerate('draft', 'l1', 'fp2', gen),
      getOrGenerate('draft', 'l1', 'fp2', gen),
    ]);
    expect(gen).toHaveBeenCalledTimes(1);
  });
  it('does not store non-cacheable (rule-based) results', async () => {
    const gen = vi.fn(async () => ({ value: 'r', cacheable: false }));
    await getOrGenerate('suggest', 'l2', 'fp', gen);
    await getOrGenerate('suggest', 'l2', 'fp', gen);
    expect(gen).toHaveBeenCalledTimes(2);
  });
  it('bypass regenerates', async () => {
    const gen = vi.fn(async () => ({ value: 'v', cacheable: true }));
    await getOrGenerate('suggest', 'l3', 'fp', gen);
    await getOrGenerate('suggest', 'l3', 'fp', gen, { bypass: true });
    expect(gen).toHaveBeenCalledTimes(2);
  });
});

describe('takeRateLimit (in-memory)', () => {
  it('allows 30 per hour then blocks with minutes left', async () => {
    const t = 1_000_000;
    for (let i = 0; i < 30; i++) expect((await takeRateLimit('u1', 30, t)).allowed).toBe(true);
    const blocked = await takeRateLimit('u1', 30, t + 10 * 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.minutesLeft).toBe(50);
    expect((await takeRateLimit('u1', 30, t + 3_600_001)).allowed).toBe(true);
  });
});
