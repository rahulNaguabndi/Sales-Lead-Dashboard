import { describe, expect, it } from 'vitest';
import type { DemographicsResponse } from '@leaddesk/shared';
import { selectInsights } from '@/server/services/demographics';

type Parts = Pick<DemographicsResponse, 'conversion' | 'channelMix' | 'modelInterest'>;
const empty = (): Parts => ({
  conversion: [
    { band: '18-25', closed: 5, suppressed: true },
    { band: '26-35', closed: 5, suppressed: true },
  ],
  channelMix: [{ band: '18-25', n: 3, suppressed: true }],
  modelInterest: { models: ['luma-ev'], rows: [{ band: '18-25', n: 3, cells: [{ model: 'luma-ev', suppressed: true }] }] },
});

describe('selectInsights', () => {
  it('omits every insight when all data is suppressed', () => {
    expect(selectInsights(empty())).toEqual({});
  });

  it('ignores suppressed entries when choosing the maximum', () => {
    const p = empty();
    p.conversion = [
      { band: '18-25', closed: 5, suppressed: true },
      { band: '26-35', closed: 40, won: 8, conversionPct: 20, suppressed: false },
      { band: '36-45', closed: 40, won: 4, conversionPct: 10, suppressed: false },
    ];
    expect(selectInsights(p).conversion).toContain('26-35');
  });

  it('breaks ties by band order', () => {
    const p = empty();
    p.conversion = [
      { band: '36-45', closed: 40, won: 8, conversionPct: 20, suppressed: false },
      { band: '26-35', closed: 40, won: 8, conversionPct: 20, suppressed: false },
    ];
    expect(selectInsights(p).conversion).toContain('26-35');
  });

  it('names the top channel and top model', () => {
    const p = empty();
    p.channelMix = [
      { band: '18-25', n: 50, shares: { CALL: 10, WHATSAPP: 60, SMS: 10, EMAIL: 20 }, suppressed: false },
    ];
    p.modelInterest.rows = [
      {
        band: '18-25',
        n: 50,
        cells: [
          { model: 'luma-ev', count: 20, sharePct: 40, suppressed: false },
          { model: 'nova-van', count: 20, sharePct: 40, suppressed: false },
        ],
      },
    ];
    const i = selectInsights(p);
    expect(i.channelMix).toContain('WhatsApp');
    expect(i.modelInterest).toContain('Luma EV');
  });
});
