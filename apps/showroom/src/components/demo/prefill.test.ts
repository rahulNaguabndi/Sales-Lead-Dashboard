import { IntakeLeadSchema, COUNTRIES } from '@leaddesk/shared';
import { describe, expect, it } from 'vitest';
import { buildPayload } from '../../lib/payload';
import { CHANNEL_WEIGHTS, makeRng, pickChannel, randomBuyer } from './prefill';

describe('prefill', () => {
  it('random buyer passes IntakeLeadSchema and phone starts with the country dial code', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { values } = await randomBuyer(seed);
      const p = buildPayload(values);
      const r = IntakeLeadSchema.safeParse(p);
      expect(r.success, JSON.stringify(r.success ? '' : r.error.issues)).toBe(true);
      expect(p.phone?.startsWith(COUNTRIES[values.country].dial)).toBe(true);
    }
  });

  it('is reproducible for a seed', async () => {
    expect((await randomBuyer(42)).values).toEqual((await randomBuyer(42)).values);
  });

  it('channel weights follow FR-033 (each row sums to 100)', () => {
    for (const w of Object.values(CHANNEL_WEIGHTS)) {
      expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
    }
    const rng = makeRng(7);
    let wa = 0;
    for (let i = 0; i < 2000; i++) if (pickChannel('18-25', rng()) === 'WHATSAPP') wa++;
    expect(wa / 2000).toBeGreaterThan(0.5);
    expect(wa / 2000).toBeLessThan(0.7);
    let call = 0;
    const rng2 = makeRng(9);
    for (let i = 0; i < 2000; i++) if (pickChannel('60+', rng2()) === 'CALL') call++;
    expect(call / 2000).toBeGreaterThan(0.5);
  });
});
