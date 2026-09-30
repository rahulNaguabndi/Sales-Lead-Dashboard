import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { intakeReq, payload, setupIntakeEnv } from '../helpers/intake-db';

type Route = typeof import('@/app/api/intake/leads/route');
let route: Route;
let rate: typeof import('@/app/api/intake/_lib/rate-limit');
let db: typeof import('@/server/db/client').db;
let schema: typeof import('@/server/db/client').schema;

beforeAll(async () => {
  await setupIntakeEnv();
  route = await import('@/app/api/intake/leads/route');
  rate = await import('@/app/api/intake/_lib/rate-limit');
  ({ db, schema } = await import('@/server/db/client'));
});

const count = () => db.select().from(schema.leads).all().length;

describe('POST /api/intake/leads', () => {
  it('creates a lead: 201 with reference, no ids or scores (FR-020)', async () => {
    const res = await route.POST(intakeReq(payload()));
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.reference).toMatch(/^EDM-\d{4}-\d{5}$/);
    expect(body.status).toBe('created');
    expect(body.expectedContact).toEqual({ channel: 'EMAIL', bestTime: 'ANYTIME' });
    expect(Object.keys(body).sort()).toEqual([
      'assignedTo',
      'expectedContact',
      'reference',
      'status',
    ]);
  });

  it('401 for a missing or unknown key and stores nothing', async () => {
    const before = count();
    const missing = intakeReq(payload(), { 'x-api-key': '' });
    expect((await route.POST(missing)).status).toBe(401);
    const unknown = intakeReq(payload(), { 'x-api-key': 'nope' });
    const res = await route.POST(unknown);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED_CLIENT');
    expect(count()).toBe(before);
  });

  it('400 with a per-field map', async () => {
    const noContact = payload({ email: undefined, phone: undefined, preferredChannel: 'CALL' });
    const r1 = await route.POST(intakeReq(noContact));
    expect(r1.status).toBe(400);
    expect((await r1.json()).error.fields.email).toBeTruthy();

    const r2 = await route.POST(intakeReq(payload({ vehicleModel: 'batmobile' })));
    expect((await r2.json()).error.fields.vehicleModel).toBeTruthy();

    const r3 = await route.POST(intakeReq(payload({ budgetMin: 90000, budgetMax: 10000 })));
    expect((await r3.json()).error.fields.budgetMin).toBeTruthy();

    const r4 = await route.POST(intakeReq(payload({ phone: '+49 12 34 5' })));
    expect(r4.status).toBe(400);
    expect((await r4.json()).error.fields.phone).toBeTruthy();
  });

  it('415 for non-JSON, 413 for oversize', async () => {
    const text = new NextRequest('http://localhost/api/intake/leads', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-api-key': 'showroom-dev-key' },
      body: 'hi',
    });
    expect((await route.POST(text)).status).toBe(415);
    const big = intakeReq(
      payload({ message: 'x'.repeat(1990), sourceDetail: 'y'.repeat(100), pad: 'z'.repeat(9000) }),
    );
    expect((await route.POST(big)).status).toBe(413);
  });

  it('honeypot: 202, nothing stored, warning logged', async () => {
    const before = count();
    const res = await route.POST(intakeReq(payload({ website: 'http://spam.test' })));
    expect(res.status).toBe(202);
    expect(count()).toBe(before);
  });

  it('never logs email or phone', async () => {
    const lines: string[] = [];
    const spies = (['info', 'warn', 'error', 'log'] as const).map((m) => {
      const orig = console[m];
      console[m] = (...a: unknown[]) => void lines.push(a.join(' '));
      return () => (console[m] = orig);
    });
    const body = payload({ email: 'secret.person@example.com' });
    await route.POST(intakeReq(body));
    spies.forEach((restore) => restore());
    const all = lines.join('\n');
    expect(all).not.toContain('secret.person');
    expect(all).not.toContain(String(body.phone));
  });

  it('429 with Retry-After after 60 requests per key+ip', async () => {
    rate.resetRateLimitMemory();
    const h = { 'x-forwarded-for': '9.9.9.9' };
    let last!: Response;
    for (let i = 0; i < 61; i++) last = await route.POST(intakeReq('{}', h));
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
    const other = await route.POST(intakeReq('{}', { 'x-forwarded-for': '8.8.8.8' }));
    expect(other.status).toBe(400);
  });
});

describe('OPTIONS /api/intake/leads', () => {
  const pre = (origin: string) =>
    new NextRequest('http://localhost/api/intake/leads', {
      method: 'OPTIONS',
      headers: { origin },
    });

  it('allows only the showroom origin', () => {
    const ok = route.OPTIONS(pre('http://localhost:3001'));
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(ok.headers.get('access-control-allow-headers')).toContain('Idempotency-Key');
    const bad = route.OPTIONS(pre('http://evil.test'));
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});
