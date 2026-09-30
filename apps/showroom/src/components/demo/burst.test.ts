import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, defaultValues } from '../../lib/payload';
import { runBurst } from './burst';

describe('runBurst', () => {
  afterEach(() => vi.useRealTimers());

  it('submits 5 leads 1.5 s apart and logs references', async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    const submit = vi.fn(async () => {
      times.push(Date.now());
      return {
        ok: true as const,
        data: {
          reference: `EDM-2026-0000${times.length}`,
          status: 'created' as const,
          assignedTo: null,
          expectedContact: { channel: 'EMAIL' as const, bestTime: 'ANYTIME' as const },
        },
      };
    });
    const seen: string[] = [];
    const p = runBurst({
      generate: async (i) =>
        buildPayload({ ...defaultValues(), firstName: `N${i}`, lastName: 'L', email: 'a@b.co' }),
      submit,
      onEntry: (e) => seen.push(e.reference ?? ''),
    });
    await vi.advanceTimersByTimeAsync(1500 * 4 + 10);
    const log = await p;
    expect(log).toHaveLength(5);
    expect(seen[4]).toBe('EDM-2026-00005');
    expect(times[1]! - times[0]!).toBe(1500);
    expect(new Set(submit.mock.calls.map((c: unknown[]) => c[1])).size).toBe(5);
  });
});
