import { describe, expect, it } from 'vitest';
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';
import {
  createGenerator,
  loadReturningPool,
  parseSimArgs,
  SOURCE_WEIGHTS,
} from '../../scripts/simulate';

describe('parseSimArgs', () => {
  it('applies the documented defaults', () => {
    const o = parseSimArgs([], {});
    expect(o).toMatchObject({
      url: 'http://localhost:3000/api/intake/leads',
      key: 'showroom-dev-key',
      rate: 12,
      count: 20,
      returning: 0.15,
      burst: false,
      failFast: false,
    });
    expect(o.countries).toHaveLength(13);
  });

  it('reads the key from INTAKE_API_KEY and flags override it', () => {
    expect(parseSimArgs([], { INTAKE_API_KEY: 'env-key' }).key).toBe('env-key');
    expect(parseSimArgs(['--key', 'flag'], { INTAKE_API_KEY: 'env-key' }).key).toBe('flag');
  });

  it('parses count 0, countries and boolean flags', () => {
    const o = parseSimArgs(['--count', '0', '--countries', 'de,fr', '--burst', '--fail-fast'], {});
    expect(o).toMatchObject({ count: 0, countries: ['DE', 'FR'], burst: true, failFast: true });
  });

  it('rejects out-of-range values', () => {
    expect(() => parseSimArgs(['--returning', '1.5'], {})).toThrow();
    expect(() => parseSimArgs(['--returning', '-0.1'], {})).toThrow();
    expect(() => parseSimArgs(['--countries', 'XX'], {})).toThrow();
    expect(() => parseSimArgs(['--rate', '0'], {})).toThrow();
  });
});

describe('generator', () => {
  const opts = { seed: 1, returning: 0, countries: ['DE', 'FR', 'IT'] as never };

  it('is deterministic for a seed', () => {
    // Faker instances are process-wide, so each run creates and drains its own generator.
    const run = (seed: number) => {
      const g = createGenerator({ ...opts, seed }, []);
      return Array.from({ length: 10 }, () => g.next());
    };
    const seqA = run(1);
    const seqB = run(1);
    expect(seqA).toEqual(seqB);
    expect(run(2)).not.toEqual(seqA);
  });

  it('produces valid mobile numbers in the requested countries', () => {
    const g = createGenerator(opts, []);
    for (let i = 0; i < 30; i++) {
      const p = g.next();
      expect(opts.countries).toContain(p.country);
      expect(parsePhoneNumberFromString(p.phone!)?.isValid()).toBe(true);
    }
  });

  it('follows the source mix', () => {
    expect(SOURCE_WEIGHTS.reduce((n, [, w]) => n + w, 0)).toBe(100);
    const g = createGenerator({ ...opts, seed: 7 }, []);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const src = g.next().source;
      counts[src] = (counts[src] ?? 0) + 1;
    }
    const website = (counts.WEBSITE ?? 0) / Object.values(counts).reduce((a, b) => a + b, 0);
    expect(website).toBeGreaterThan(0.3);
    expect(website).toBeLessThan(0.4);
  });

  it('draws returning phones from the seed customer generator (same SEED, no DB)', () => {
    const pool = loadReturningPool({ SEED: '42' });
    expect(pool.length).toBeGreaterThan(20);
    expect(loadReturningPool({ SEED: '42' })[0]!.phone).toBe(pool[0]!.phone);
    const g = createGenerator(
      { seed: 3, returning: 1, countries: ['DE', 'FR', 'IT'] as never },
      pool,
    );
    const p = g.next();
    expect(g.isReturning(p)).toBe(true);
    expect(pool.map((x) => x.phone)).toContain(p.phone);
  });
});
