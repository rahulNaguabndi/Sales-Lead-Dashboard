import { describe, expect, it } from 'vitest';
import { BAR_COLOR, CHANNEL_COLORS, INK, RAMP, SURFACE, contrast, inkOn, rampStep } from '@/components/dashboard/demographics/palette';

describe('demographics palette', () => {
  it('chart marks have 3:1 contrast against their surface (light and dark)', () => {
    for (const c of Object.values(CHANNEL_COLORS)) {
      expect(contrast(c.light, SURFACE.light)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.dark, SURFACE.dark)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(BAR_COLOR.light, SURFACE.light)).toBeGreaterThanOrEqual(3);
    expect(contrast(BAR_COLOR.dark, SURFACE.dark)).toBeGreaterThanOrEqual(3);
  });

  it('cell text reaches 4.5:1 on every ramp step', () => {
    for (const fill of RAMP) expect(contrast(fill, inkOn(fill))).toBeGreaterThanOrEqual(4.5);
    expect(inkOn(RAMP[0])).toBe(INK.primary);
    expect(inkOn(RAMP[RAMP.length - 1]!)).toBe(INK.inverse);
  });

  it('maps shares onto the ramp monotonically', () => {
    expect(rampStep(0, 40)).toBe(0);
    expect(rampStep(40, 40)).toBe(RAMP.length - 1);
    expect(rampStep(20, 40)).toBeLessThanOrEqual(rampStep(30, 40));
  });
});
