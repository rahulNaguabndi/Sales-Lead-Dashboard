import { beforeAll, describe, expect, it } from 'vitest';
import { req } from '../../integration/auth/helpers';
import { EMAIL, setupActivityEnv, type Ctx } from '../../integration/activity-helpers';

type Handler = (r: never, c: { params: { id: string } }) => Promise<Response>;
let c: Ctx;
let suggest: Handler;
let draft: Handler;
let feedback: Handler;

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  c = await setupActivityEnv();
  suggest = (await import('@/app/api/leads/[id]/ai/suggest/route')).POST as never;
  draft = (await import('@/app/api/leads/[id]/ai/draft/route')).POST as never;
  feedback = (await import('@/app/api/leads/[id]/ai/feedback/route')).POST as never;
});

const call = (h: Handler, cookie: string | null, id: string, suffix: string, body: unknown = {}) =>
  h(
    req(`/api/leads/${id}/ai/${suffix}`, {
      method: 'POST',
      body,
      cookie: cookie ?? undefined,
      headers: { host: 'localhost' },
    }) as never,
    { params: { id } },
  );

const fb = { kind: 'suggest', fingerprint: 'abc', vote: 'up' };

describe('AI routes RBAC', () => {
  it('401 without a session', async () => {
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await call(suggest, null, id, 'suggest')).status).toBe(401);
    expect((await call(draft, null, id, 'draft', { channel: 'SMS' })).status).toBe(401);
    expect((await call(feedback, null, id, 'feedback', fb)).status).toBe(401);
  });

  it('rep on own lead: suggest 200 (rules), draft 200, feedback 204', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'CONTACTED' });
    const s = await call(suggest, sofia, id, 'suggest');
    expect(s.status).toBe(200);
    const body = await s.json();
    expect(body.source).toBe('RULES');
    expect(body.fallbackReason).toBe('NO_API_KEY');
    expect(body.summary.length).toBeLessThanOrEqual(600);
    const d = await call(draft, sofia, id, 'draft', { channel: 'WHATSAPP' });
    expect(d.status).toBe(200);
    expect((await d.json()).draft.channel).toBe('WHATSAPP');
    expect((await call(feedback, sofia, id, 'feedback', fb)).status).toBe(204);
  });

  it('rep on another rep or team lead is denied', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const dach = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    for (const [h, sfx, body] of [
      [suggest, 'suggest', {}],
      [draft, 'draft', { channel: 'SMS' }],
      [feedback, 'feedback', fb],
    ] as const) {
      const res = await call(h, sofia, dach, sfx, body);
      expect([403, 404]).toContain(res.status);
    }
  });

  it('manager in scope 200, out of scope denied; VP 200', async () => {
    const id = c.createLead({ owner: EMAIL.anna, stage: 'CONTACTED' });
    const lukas = await c.login(EMAIL.lukas);
    const marco = await c.login(EMAIL.marco);
    const vp = await c.login(EMAIL.isabelle);
    expect((await call(suggest, lukas, id, 'suggest')).status).toBe(200);
    expect([403, 404]).toContain((await call(suggest, marco, id, 'suggest')).status);
    expect((await call(suggest, vp, id, 'suggest')).status).toBe(200);
    expect((await call(feedback, vp, id, 'feedback', fb)).status).toBe(204);
  });

  it('unknown lead 404, bad body 400', async () => {
    const sofia = await c.login(EMAIL.sofia);
    expect((await call(suggest, sofia, 'nope', 'suggest')).status).toBe(404);
    const id = c.createLead({ stage: 'CONTACTED' });
    expect((await call(draft, sofia, id, 'draft', { channel: 'CALL' })).status).toBe(400);
    expect((await call(feedback, sofia, id, 'feedback', { vote: 'maybe' })).status).toBe(400);
  });

  it('closed lead: suggest is WAIT with no API call, draft is 409 LEAD_CLOSED', async () => {
    const sofia = await c.login(EMAIL.sofia);
    const id = c.createLead({ stage: 'WON' });
    const s = await (await call(suggest, sofia, id, 'suggest')).json();
    expect(s.nextBestAction.action).toBe('WAIT');
    const d = await call(draft, sofia, id, 'draft', { channel: 'EMAIL' });
    expect(d.status).toBe(409);
    expect((await d.json()).error.code).toBe('LEAD_CLOSED');
  });
});

describe('no API key: every seeded lead is rule-based (SC-004) and PII-free (SC-003)', () => {
  it('builds clean contexts and answers for all leads', async () => {
    const { loadLeadContext } = await import('@/server/services/ai');
    const { buildUserMessage } = await import('@/server/services/ai/prompts');
    const { suggestForLead } = await import('@/server/services/ai');
    const vp = c.sqlite
      .prepare("select id, name, email, role, team_id as teamId from users where role = 'VP'")
      .get() as { id: string; name: string; email: string; role: 'VP'; teamId: string | null };
    const rows = c.sqlite
      .prepare(
        `select l.id, cu.last_name ln, cu.email, cu.phone, cu.id cid
         from leads l join customers cu on cu.id = l.customer_id`,
      )
      .all() as { id: string; ln: string; email: string | null; phone: string | null; cid: string }[];
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      const ctx = await loadLeadContext(vp, r.id);
      const text = JSON.stringify(ctx) + buildUserMessage(ctx, 'suggest') + buildUserMessage(ctx, 'draft', 'EMAIL');
      if (r.email) expect(text).not.toContain(r.email);
      if (r.phone) expect(text).not.toContain(r.phone);
      if (r.ln.length > 3) expect(text.toLowerCase()).not.toContain(r.ln.toLowerCase());
      expect(text).not.toContain(r.cid);
      const res = await suggestForLead(vp, r.id);
      expect(res.source).toBe('RULES');
    }
  });
});
