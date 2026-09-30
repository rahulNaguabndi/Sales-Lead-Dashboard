import { describe, expect, it } from 'vitest';
import { DEMO_BANDS, DemographicsResponseSchema, type RawDemographics } from '@leaddesk/shared';
import { applySuppression } from '@/server/services/demographics';

const period = { from: 0, to: 1, range: '90d' as const };
const raw = (o: Partial<RawDemographics> = {}): RawDemographics => ({
  conversion: [],
  channel: [],
  model: [],
  orgClosed: 0,
  orgWon: 0,
  excludedUnknownAge: 0,
  excludedNoModel: 0,
  availableCountries: [],
  ...o,
});
const run = (r: RawDemographics) => applySuppression(r, period, 123);

describe('applySuppression', () => {
  it('suppresses conversion below 20 closed, shows at 20', () => {
    const out = run(
      raw({
        conversion: [
          { band: '18-25', closed: 19, won: 10 },
          { band: '26-35', closed: 20, won: 5 },
        ],
      }),
    );
    expect(out.conversion[0]).toEqual({ band: '18-25', closed: 19, suppressed: true });
    expect(out.conversion[1]).toMatchObject({ band: '26-35', closed: 20, won: 5, conversionPct: 25, suppressed: false });
  });

  it('suppresses channel rows below 30 leads, shows at 30', () => {
    const mk = (band: '18-25' | '26-35', n: number) => [
      { band, channel: 'CALL' as const, n: n - 10 },
      { band, channel: 'WHATSAPP' as const, n: 10 },
    ];
    const out = run(raw({ channel: [...mk('18-25', 29), ...mk('26-35', 30)] }));
    expect(out.channelMix[0]).toEqual({ band: '18-25', n: 29, suppressed: true });
    expect(out.channelMix[1]).toMatchObject({ n: 30, suppressed: false });
    const e = out.channelMix[1]!;
    if (!e.suppressed) expect(e.shares.CALL + e.shares.WHATSAPP + e.shares.SMS + e.shares.EMAIL).toBeCloseTo(100, 0);
  });

  it('suppresses heatmap cells below 5, shows at 5', () => {
    const out = run(
      raw({
        model: [
          { band: '18-25', model: 'luma-ev', n: 4 },
          { band: '18-25', model: 'nova-van', n: 5 },
        ],
      }),
    );
    const cells = out.modelInterest.rows[0]!.cells;
    expect(cells.find((c) => c.model === 'luma-ev')).toEqual({ model: 'luma-ev', suppressed: true });
    expect(cells.find((c) => c.model === 'nova-van')).toMatchObject({ count: 5, suppressed: false });
  });

  it('always emits all five bands in order and every model per row', () => {
    const out = run(raw());
    expect(out.conversion.map((c) => c.band)).toEqual([...DEMO_BANDS]);
    expect(out.channelMix.map((c) => c.band)).toEqual([...DEMO_BANDS]);
    expect(out.modelInterest.rows.map((r) => r.band)).toEqual([...DEMO_BANDS]);
    expect(out.modelInterest.rows[0]!.cells).toHaveLength(out.modelInterest.models.length);
    expect(out.orgConversionPct).toBeNull();
  });

  it('suppressed entries never serialize value fields (SC-002)', () => {
    const out = run(
      raw({
        conversion: [{ band: '60+', closed: 7, won: 3 }],
        channel: [{ band: '60+', channel: 'CALL', n: 12 }],
        model: [{ band: '60+', model: 'luma-ev', n: 3 }],
      }),
    );
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/"won":3|"conversionPct":4[0-9]|"shares":\{[^}]*\}.*60\+/);
    const c = out.conversion[4]!;
    expect(Object.keys(c).sort()).toEqual(['band', 'closed', 'suppressed']);
    expect(Object.keys(out.channelMix[4]!).sort()).toEqual(['band', 'n', 'suppressed']);
    expect(DemographicsResponseSchema.safeParse(out).success).toBe(true);
  });
});
