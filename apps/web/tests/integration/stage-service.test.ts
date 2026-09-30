import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, setupStageEnv, type StageCtx } from './stage-helpers';

let c: StageCtx;
let sofia: string;
beforeAll(async () => {
  c = await setupStageEnv();
  sofia = await c.login(EMAIL.sofia);
});

const v = (id: string) => c.lead(id).version as number;
const meta = (id: string, order = '') =>
  JSON.parse(
    c.rows(
      `select metadata from activities where lead_id=? and type='STAGE_CHANGED' ${order}`,
      id,
    )[0]!.metadata as string,
  );

describe('open -> open transitions', () => {
  it('writes stage_history + STAGE_CHANGED, bumps version', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const res = await c.patch(sofia, id, { to: 'QUALIFIED', version: v(id) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lead.stage).toBe('QUALIFIED');
    expect(body.lead.version).toBe(4);
    expect(
      c.rows('select from_stage, to_stage, changed_by from stage_history where lead_id=?', id),
    ).toEqual([
      { from_stage: 'CONTACTED', to_stage: 'QUALIFIED', changed_by: c.userId(EMAIL.sofia) },
    ]);
    expect(meta(id)).toMatchObject({ from: 'CONTACTED', to: 'QUALIFIED' });
    expect(
      c.rows("select 1 from audit_log where entity_id=? and action='lead.stage'", id),
    ).toHaveLength(1);
  });

  it('same-stage is a 200 no-op without writes', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    const before = c.counts();
    const res = await c.patch(sofia, id, { to: 'CONTACTED', version: v(id) });
    expect(res.status).toBe(200);
    expect(c.counts()).toEqual(before);
    expect(v(id)).toBe(3);
  });

  it('NEW -> WON is 422 INVALID_TRANSITION and changes nothing', async () => {
    const id = c.createLead({ stage: 'NEW' });
    const before = c.counts();
    const res = await c.patch(sofia, id, { to: 'WON', version: v(id), dealValue: 100 });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION');
    expect(c.counts()).toEqual(before);
  });

  it('stale version is 409 VERSION_CONFLICT with the current lead', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(sofia, id, { to: 'QUALIFIED', version: 3 })).status).toBe(200);
    const res = await c.patch(sofia, id, { to: 'TEST_DRIVE', version: 3 });
    expect(res.status).toBe(409);
    const b = await res.json();
    expect(b.error.code).toBe('VERSION_CONFLICT');
    expect(b.error.current).toMatchObject({ id, stage: 'QUALIFIED', version: 4 });
    expect(c.lead(id).stage).toBe('QUALIFIED');
  });
});

describe('WON', () => {
  it('saves closing data, purchase, returning flag and cancels pending follow-ups', async () => {
    const id = c.createLead({ stage: 'NEGOTIATION' });
    const pending = c.addFollowUp(id);
    const done = c.addFollowUp(id, 'DONE');
    const offerId = c.addOffer();
    const res = await c.patch(sofia, id, {
      to: 'WON',
      version: v(id),
      dealValue: 3650000,
      vehicleModel: 'aurora-suv',
      appliedOfferId: offerId,
    });
    expect(res.status).toBe(200);
    const l = c.lead(id);
    expect(l).toMatchObject({ stage: 'WON', deal_value: 3650000, applied_offer_id: offerId });
    expect(l.closed_at).toBeTypeOf('number');
    const p = c.rows('select * from purchases where lead_id=?', id);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ amount: 3650000, vehicle_model: 'aurora-suv' });
    expect(
      c.rows('select is_returning from customers where id=?', l.customer_id)[0]!.is_returning,
    ).toBe(1);
    const st = (fid: string) => c.rows('select status from follow_ups where id=?', fid)[0]!.status;
    expect(st(pending)).toBe('CANCELLED');
    expect(st(done)).toBe('DONE');
    expect(
      c.rows("select 1 from activities where lead_id=? and type='OFFER_APPLIED'", id),
    ).toHaveLength(1);
    expect(meta(id)).toMatchObject({ dealValue: 3650000, vehicleModel: 'aurora-suv' });
  });

  it.each([{}, { dealValue: 0 }, { dealValue: -5 }, { dealValue: 100_000_001 }])(
    'requires a valid deal value %o (422 VALIDATION)',
    async (extra) => {
      const id = c.createLead({ stage: 'NEGOTIATION' });
      const res = await c.patch(sofia, id, { to: 'WON', version: v(id), ...extra });
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('VALIDATION');
      expect(c.lead(id).stage).toBe('NEGOTIATION');
    },
  );

  it('expired, inactive or unknown offer is 422 OFFER_NOT_APPLICABLE and rolls back', async () => {
    for (const offerId of [
      c.addOffer({ validTo: Date.now() - 1000 }),
      c.addOffer({ active: false }),
      'nope',
    ]) {
      const id = c.createLead({ stage: 'NEGOTIATION' });
      const before = c.counts();
      const res = await c.patch(sofia, id, {
        to: 'WON',
        version: v(id),
        dealValue: 1000,
        appliedOfferId: offerId,
      });
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe('OFFER_NOT_APPLICABLE');
      expect(c.counts()).toEqual(before);
      expect(c.lead(id).stage).toBe('NEGOTIATION');
      expect(c.rows('select 1 from purchases where lead_id=?', id)).toHaveLength(0);
    }
  });

  it('WON is terminal', async () => {
    const id = c.createLead({ stage: 'NEGOTIATION' });
    await c.patch(sofia, id, { to: 'WON', version: v(id), dealValue: 1000 });
    const res = await c.patch(sofia, id, { to: 'CONTACTED', version: v(id) });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('INVALID_TRANSITION');
  });
});

describe('LOST, reopen and revive', () => {
  it('requires a reason; OTHER requires a note', async () => {
    const id = c.createLead({ stage: 'QUALIFIED' });
    expect((await c.patch(sofia, id, { to: 'LOST', version: v(id) })).status).toBe(422);
    const other = { to: 'LOST', version: v(id), lostReason: 'OTHER' };
    expect((await c.patch(sofia, id, other)).status).toBe(422);
    expect(c.lead(id).stage).toBe('QUALIFIED');
  });

  it('saves the reason, closes and cancels follow-ups', async () => {
    const id = c.createLead({ stage: 'QUALIFIED' });
    const f = c.addFollowUp(id);
    const res = await c.patch(sofia, id, { to: 'LOST', version: v(id), lostReason: 'PRICE' });
    expect(res.status).toBe(200);
    expect(c.lead(id)).toMatchObject({ stage: 'LOST', lost_reason: 'PRICE' });
    expect(c.lead(id).closed_at).toBeTypeOf('number');
    expect(c.rows('select status from follow_ups where id=?', f)[0]!.status).toBe('CANCELLED');
  });

  it('manager reopens LOST to CONTACTED, clearing closing fields; rep cannot (403)', async () => {
    const id = c.createLead({ stage: 'QUALIFIED' });
    await c.patch(sofia, id, {
      to: 'LOST',
      version: v(id),
      lostReason: 'OTHER',
      lostNote: 'moved abroad',
    });
    expect((await c.patch(sofia, id, { to: 'CONTACTED', version: v(id) })).status).toBe(403);
    const marco = await c.login(EMAIL.marco);
    const res = await c.patch(marco, id, { to: 'CONTACTED', version: v(id) });
    expect(res.status).toBe(200);
    expect(c.lead(id)).toMatchObject({
      stage: 'CONTACTED',
      closed_at: null,
      lost_reason: null,
      lost_note: null,
    });
    expect(meta(id, 'order by created_at desc, id desc').reopened).toBe(true);
  });

  it('COLD to CONTACTED revives and resets attempt_count', async () => {
    const id = c.createLead({ stage: 'COLD', attemptCount: 4 });
    const res = await c.patch(sofia, id, { to: 'CONTACTED', version: v(id) });
    expect(res.status).toBe(200);
    expect(c.lead(id)).toMatchObject({ stage: 'CONTACTED', attempt_count: 0 });
  });

  it('manual COLD: rep 422, manager ok', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await c.patch(sofia, id, { to: 'COLD', version: v(id) })).status).toBe(422);
    const marco = await c.login(EMAIL.marco);
    expect((await c.patch(marco, id, { to: 'COLD', version: v(id) })).status).toBe(200);
  });
});

describe('transition() for system callers and events', () => {
  it('system auto-COLD has changedBy null and needs no version', async () => {
    const { transition } = await import('@/server/services/stage');
    const id = c.createLead({ stage: 'CONTACTED' });
    const out = await transition({ user: null }, id, { to: 'COLD', reason: 'auto:cold' });
    expect(out.lead.stage).toBe('COLD');
    expect(c.rows('select changed_by, reason from stage_history where lead_id=?', id)).toEqual([
      { changed_by: null, reason: 'auto:cold' },
    ]);
  });

  it('publishes after commit and publishes nothing on failure (SC-003)', async () => {
    const { transition } = await import('@/server/services/stage');
    const events: string[] = [];
    const publish = (e: { type: string }) => void events.push(e.type);
    const user = {
      id: c.userId(EMAIL.sofia),
      role: 'REP',
      teamId: null,
      name: 'Sofia',
    } as never;
    const id = c.createLead({ stage: 'CONTACTED' });
    await transition({ user, publish }, id, { to: 'QUALIFIED', version: v(id) });
    expect(events.filter((e) => e === 'activity.created').length).toBeGreaterThanOrEqual(1);
    expect(events).toContain('lead.updated');
    const n = events.length;
    await expect(
      transition({ user, publish }, id, { to: 'QUALIFIED', version: 99 }),
    ).rejects.toThrow();
    await expect(
      transition({ user, publish }, id, { to: 'NEW' as never, version: v(id) }),
    ).rejects.toThrow();
    expect(events.length).toBe(n);
  });
});

describe('listPipeline', () => {
  it('per-column counts, ordering, scope, 30-day window and filters', async () => {
    const { listPipeline, PIPELINE_STAGES } = await import('@/server/services/stage');
    const user = {
      id: c.userId(EMAIL.sofia),
      role: 'REP',
      teamId: null,
      name: 'Sofia',
    } as never;
    const won = c.createLead({ stage: 'NEGOTIATION' });
    await c.patch(sofia, won, { to: 'WON', version: v(won), dealValue: 500000 });
    const old = c.createLead({ stage: 'LOST' });
    c.sqlite
      .prepare('update leads set closed_at=? where id=?')
      .run(Date.now() - 40 * 86_400_000, old);
    const { columns } = await listPipeline(user);
    expect(columns.map((x) => x.stage)).toEqual([...PIPELINE_STAGES]);
    const wonCol = columns.find((x) => x.stage === 'WON')!;
    expect(wonCol.leads.some((l) => l.id === won)).toBe(true);
    expect(wonCol.valueCents).toBeGreaterThanOrEqual(500000);
    expect(columns.find((x) => x.stage === 'LOST')!.leads.some((l) => l.id === old)).toBe(false);
    for (const col of columns) {
      expect(col.leads.length + col.more).toBe(col.count);
      for (let i = 1; i < col.leads.length; i++) {
        expect(col.leads[i - 1]!.score).toBeGreaterThanOrEqual(col.leads[i]!.score);
      }
      for (const l of col.leads) expect([(user as { id: string }).id, null]).toContain(l.ownerId);
    }
    const hot = await listPipeline(user, { priority: ['HOT'] });
    for (const col of hot.columns) for (const l of col.leads) expect(l.priority).toBe('HOT');
  });
});
