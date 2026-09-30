import { expect, test } from '@playwright/test';

// API-level journey: the port comes from playwright.config.ts (PORT), nothing is hardcoded.
const KEY = process.env.INTAKE_API_KEY ?? 'showroom-dev-key';

function enquiry(n: number) {
  return {
    firstName: 'E2E',
    lastName: `Intake${n}`,
    email: `e2e.intake${n}.${Date.now()}@example.com`,
    phone: `+49152${String(Date.now()).slice(-8)}`,
    country: 'DE',
    city: 'Hamburg',
    language: 'de',
    preferredChannel: 'EMAIL',
    source: 'FACEBOOK',
    vehicleModel: 'aurora-suv',
  };
}

test.describe('lead intake API', () => {
  test('accepts an enquiry, returns a reference and replays idempotently', async ({ request }) => {
    const headers = { 'x-api-key': KEY, 'idempotency-key': `e2e-${Date.now()}` };
    const body = enquiry(1);
    const res = await request.post('/api/intake/leads', { headers, data: body });
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.reference).toMatch(/^EDM-\d{4}-\d{5}$/);
    expect(json.expectedContact.channel).toBe('EMAIL');

    const replay = await request.post('/api/intake/leads', { headers, data: body });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).reference).toBe(json.reference);
  });

  test('rejects a bad key and an invalid body', async ({ request }) => {
    const bad = await request.post('/api/intake/leads', {
      headers: { 'x-api-key': 'wrong' },
      data: enquiry(2),
    });
    expect(bad.status()).toBe(401);
    const invalid = await request.post('/api/intake/leads', {
      headers: { 'x-api-key': KEY },
      data: { firstName: 'x' },
    });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error.fields).toBeTruthy();
  });
});
