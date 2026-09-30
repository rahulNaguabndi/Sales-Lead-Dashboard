import { describe, expect, it } from 'vitest';
import { resolveScope } from '../scope';
import { buildLargeTree, createFixture } from './fixtures';

async function medianMs(fn: () => Promise<unknown>, runs: number): Promise<number> {
  await fn(); // warm the statement cache
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

describe('scope performance (SC-002)', () => {
  it('< 5 ms on the seeded org', async () => {
    const fx = createFixture();
    expect(await medianMs(() => resolveScope('isabelle', fx.db), 50)).toBeLessThan(5);
  });

  it('< 20 ms on a 1,000-user tree', async () => {
    const { db, rootId } = buildLargeTree();
    const s = await resolveScope(rootId, db);
    expect(s.userIds.size).toBe(1000);
    expect(await medianMs(() => resolveScope(rootId, db), 20)).toBeLessThan(20);
  });
});
