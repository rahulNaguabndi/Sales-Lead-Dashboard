import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_BANDS } from '@leaddesk/shared';
import { EMAIL, setupActivityEnv, type Ctx } from '../../integration/activity-helpers';

let c: Ctx;
let svc: typeof import('@/server/services/demographics');
let getCurrentUserById: (email: string) => Promise<never>;

beforeAll(async () => {
  c = await setupActivityEnv();
  svc = await import('@/server/services/demographics');
  getCurrentUserById = async (email) => {
    const r = c.sqlite.prepare('select id, role, team_id as teamId from users where email = ?').get(email) as never;
    return r;
  };
});

const now = Date.now();
const FILTERS = { range: '90d' as const };

describe('getDemographics', () => {
  it('matches independent SQL for channel mix, exclusions and org conversion (SC-001)', async () => {
    const vp = await getCurrentUserById(EMAIL.isabelle);
    const out = await svc.getDemographics(vp, FILTERS, undefined, now);
    const from = now - 90 * 86_400_000;
    const q = (sql: string) =>
      (c.sqlite.prepare(sql).get(from, now) as { n: number }).n;
    const known = q(
      `select count(*) n from leads l join customers c on c.id=l.customer_id where c.age_band != 'UNKNOWN' and l.created_at between ? and ?`,
    );
    const unknown = q(
      `select count(*) n from leads l join customers c on c.id=l.customer_id where c.age_band = 'UNKNOWN' and l.created_at between ? and ?`,
    );
    const totalN = out.channelMix.reduce((s, e) => s + e.n, 0);
    expect(totalN).toBe(known);
    expect(out.excluded.unknownAge).toBe(unknown);
    const closed = c.sqlite
      .prepare(
        `select count(*) closed, sum(l.stage='WON') won from leads l join customers c on c.id=l.customer_id
         where c.age_band != 'UNKNOWN' and l.stage in ('WON','LOST') and l.closed_at between ? and ?`,
      )
      .get(from, now) as { closed: number; won: number | null };
    expect(out.orgConversionPct).toBe(
      closed.closed ? Math.round(((closed.won ?? 0) / closed.closed) * 1000) / 10 : null,
    );
    expect(out.conversion.map((e) => e.band)).toEqual([...DEMO_BANDS]);
  });

  it('country and sourceGroup filters narrow the result', async () => {
    const vp = await getCurrentUserById(EMAIL.isabelle);
    const all = await svc.getDemographics(vp, FILTERS, undefined, now);
    const country = all.availableCountries[0]!;
    const narrow = await svc.getDemographics(vp, { ...FILTERS, country }, undefined, now);
    const tot = (x: typeof all) => x.channelMix.reduce((s, e) => s + e.n, 0);
    expect(tot(narrow)).toBeLessThanOrEqual(tot(all));
    expect(narrow.availableCountries).toEqual(all.availableCountries);
    const web = await svc.getDemographics(vp, { ...FILTERS, sourceGroup: 'WEBSITE' }, undefined, now);
    expect(tot(web)).toBeLessThanOrEqual(tot(all));
  });

  it('never leaks values for suppressed entries', async () => {
    const vp = await getCurrentUserById(EMAIL.isabelle);
    const out = await svc.getDemographics(vp, { ...FILTERS, range: 'today' }, undefined, now);
    for (const e of [...out.conversion, ...out.channelMix]) {
      if (e.suppressed) expect(Object.keys(e)).not.toEqual(expect.arrayContaining(['won']));
    }
  });
});
