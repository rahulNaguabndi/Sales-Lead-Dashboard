import { expect, test } from '@playwright/test';

// Needs the showroom (SHOWROOM_PORT, default 3001) and the web app with intake (PORT, default 3000).
// Skipped when the intake API is unreachable or F10/F12 are not merged. Not wired into the root
// Playwright config (its testDir is apps/web/e2e); run with:
//   npx playwright test apps/showroom/src/e2e --config <config with testDir>
const web = `http://localhost:${process.env.PORT ?? '3000'}`;
const showroom = `http://localhost:${process.env.SHOWROOM_PORT ?? '3001'}`;

test('enquiry submitted in the showroom reaches the inbox', async ({ page, request }) => {
  const probe = await request.get(`${web}/api/health`).catch(() => null);
  test.skip(!probe || !probe.ok(), 'intake API not reachable (F10/F12 not merged or app not running)');

  const unique = `E2E${Date.now()}`;
  await page.goto(showroom);
  await page.getByRole('button', { name: /I'm interested in the Aurora SUV/ }).click();
  await page.getByLabel('First name').fill(unique);
  await page.getByLabel('Last name').fill('Showroom');
  await page.getByLabel('Email').fill(`${unique.toLowerCase()}@example.com`);
  await page.getByRole('textbox', { name: 'Phone' }).fill('151 1234 5678');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText(/EDM-2026-/)).toBeVisible();

  await page.goto(`${web}/inbox`);
  await expect(page.getByText(unique)).toBeVisible({ timeout: 2000 + 3000 });
});
