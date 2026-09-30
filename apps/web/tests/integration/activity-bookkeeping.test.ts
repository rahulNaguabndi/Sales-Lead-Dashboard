import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
let sofia: string;
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
});

const systemRows = (leadId: string, type: string) =>
  c.sqlite
    .prepare("select note, metadata from activities where lead_id=? and kind='SYSTEM' and type=?")
    .all(leadId, type) as { note: string; metadata: string }[];

describe('automatic lead bookkeeping', () => {
  it('NEW + Call -> CONTACTED with first response and STAGE_CHANGED', async () => {
    const id = c.createLead({ stage: 'NEW' });
    const res = await c.post(sofia, id, ok());
    expect(res.status).toBe(201);
    const row = c.lead(id);
    expect(row.stage).toBe('CONTACTED');
    expect(row.first_response_at).toBeTruthy();
    const [st] = systemRows(id, 'STAGE_CHANGED');
    expect(st!.note).toContain('NEW → CONTACTED');
    expect(JSON.parse(st!.metadata)).toMatchObject({ reason: 'auto:first_activity' });
    const hist = c.sqlite
      .prepare('select reason, changed_by from stage_history where lead_id=?')
      .all(id);
    expect(hist).toHaveLength(1);
  });

  it('NEW + Note stays NEW with no first response and unchanged attempts', async () => {
    const id = c.createLead({ stage: 'NEW', attemptCount: 2 });
    await c.post(sofia, id, { clientRequestId: c.reqId(), type: 'NOTE', note: 'internal' });
    const row = c.lead(id);
    expect(row.stage).toBe('NEW');
    expect(row.first_response_at).toBeNull();
    expect(row.last_contact_at).toBeNull();
    expect(row.attempt_count).toBe(2);
    expect(row.last_activity_at).toBeTruthy();
  });

  it('COLD + contact -> CONTACTED (auto:revive)', async () => {
    const id = c.createLead({ stage: 'COLD' });
    await c.post(sofia, id, ok({ type: 'WHATSAPP', outcome: 'NO_ANSWER' }));
    expect(c.lead(id).stage).toBe('CONTACTED');
    expect(JSON.parse(systemRows(id, 'STAGE_CHANGED')[0]!.metadata).reason).toBe('auto:revive');
  });

  it('attempt count goes 1 -> 2 -> 0', async () => {
    const id = c.createLead({ stage: 'CONTACTED', attemptCount: 1 });
    await c.post(sofia, id, ok({ outcome: 'NO_ANSWER' }));
    expect(c.lead(id).attempt_count).toBe(2);
    await c.post(sofia, id, ok({ outcome: 'CONNECTED' }));
    expect(c.lead(id).attempt_count).toBe(0);
  });

  it('Interested recomputes the score and records a priority band change', async () => {
    const id = c.createLead({ stage: 'CONTACTED', score: 99, priority: 'HOT' });
    const res = await c.post(sofia, id, ok({ outcome: 'INTERESTED' }));
    const body = await res.json();
    expect(body.lead.score).not.toBe(99);
    expect(body.lead.scoreBreakdown.engagement).toBeGreaterThan(0);
    const rows = systemRows(id, 'SCORE_CHANGED');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.metadata)).toMatchObject({
      fromPriority: 'HOT',
      toPriority: body.lead.priority,
    });
    expect(body.systemActivities.some((a: { type: string }) => a.type === 'SCORE_CHANGED')).toBe(
      true,
    );
  });

  it.each(['WON', 'LOST'])('%s leads accept a Note and keep their stage', async (stage) => {
    const id = c.createLead({ stage });
    const res = await c.post(sofia, id, {
      clientRequestId: c.reqId(),
      type: 'NOTE',
      note: 'post-sale',
    });
    expect(res.status).toBe(201);
    expect(c.lead(id).stage).toBe(stage);
  });
});
