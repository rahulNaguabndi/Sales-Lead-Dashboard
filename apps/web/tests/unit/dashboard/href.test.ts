import { describe, expect, it } from 'vitest';
import { buildInboxHref } from '@/lib/dashboard-href';

const period = { fromDate: '2026-09-01', toDate: '2026-09-30' };

describe('buildInboxHref', () => {
  it('carries the period and filters', () => {
    const href = buildInboxHref({ teamId: 't1', sourceGroup: 'WEBSITE' }, period, { stage: 'NEW' });
    const sp = new URL(href, 'http://x').searchParams;
    expect(href.startsWith('/inbox?')).toBe(true);
    expect(Object.fromEntries(sp)).toEqual({
      createdFrom: '2026-09-01',
      createdTo: '2026-09-30',
      team: 't1',
      sourceGroup: 'WEBSITE',
      stage: 'NEW',
    });
  });
  it('extra overrides filters and omits empties', () => {
    const href = buildInboxHref({ ownerId: 'a' }, null, { owner: 'b', overdue: '1' });
    expect(href).toBe('/inbox?owner=b&overdue=1');
    expect(buildInboxHref({}, null)).toBe('/inbox');
  });
});
