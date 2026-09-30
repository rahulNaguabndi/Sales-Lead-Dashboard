import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Port comes from playwright.config.ts (PORT); nothing is hardcoded.
const KEY = process.env.INTAKE_API_KEY ?? 'showroom-dev-key';

test('a new DACH lead appears live for the DACH manager and never for a South rep', async ({
  browser,
  request,
}) => {
  const dach = await (await browser.newContext()).newPage();
  const south = await (await browser.newContext()).newPage();
  await signIn(dach, 'lukas.becker@eurodrive.test');
  await signIn(south, 'sofia.rossi@eurodrive.test');
  await dach.goto('/inbox?sort=newest');
  await south.goto('/inbox?sort=newest');
  await expect(dach.getByRole('status')).toContainText('Live', { timeout: 15_000 });
  await expect(south.getByRole('status')).toContainText('Live', { timeout: 15_000 });

  const lastName = `Live${Date.now()}`;
  const res = await request.post('/api/intake/leads', {
    headers: { 'x-api-key': KEY, 'idempotency-key': `live-${Date.now()}` },
    data: {
      firstName: 'E2E',
      lastName,
      email: `live.${Date.now()}@example.com`,
      phone: `+49152${String(Date.now()).slice(-8)}`,
      country: 'DE',
      city: 'Hamburg',
      language: 'de',
      preferredChannel: 'EMAIL',
      source: 'WEBSITE',
      vehicleModel: 'aurora-suv',
    },
  });
  expect(res.status()).toBe(201);

  // No reload: the row shows up through the live stream within a few seconds.
  await expect(dach.getByText(lastName)).toBeVisible({ timeout: 10_000 });
  await south.waitForTimeout(2500);
  await expect(south.getByText(lastName)).toHaveCount(0);
});
