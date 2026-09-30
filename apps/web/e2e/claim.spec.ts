import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.describe('claim (F11)', () => {
  test('rep claims from Unassigned and the timeline records it', async ({ page }) => {
    await signIn(page, 'anna.weber@eurodrive.test');
    await page.goto('/inbox?view=unassigned');
    const row = page.locator('[data-lead-row]').first();
    await expect(row).toBeVisible();
    const id = await row.getAttribute('data-lead-id');
    // Clicking before hydration is dropped: retry until the claim lands.
    await expect(async () => {
      await row.getByTestId('claim-button').click({ timeout: 2000 });
      await expect(page.locator(`[data-lead-id="${id}"]`)).toHaveCount(0, { timeout: 4000 });
    }).toPass({ timeout: 20000 });

    await page.goto(`/leads/${id}`);
    await expect(page.getByText('Claimed by Anna Weber').first()).toBeVisible();
  });

  test('a second session gets the already-claimed conflict', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await signIn(a, 'anna.weber@eurodrive.test');
    await signIn(b, 'jonas.fischer@eurodrive.test');
    await b.goto('/inbox?view=unassigned');
    const id = await b.locator('[data-lead-row]').first().getAttribute('data-lead-id');
    // Anna claims through the API; Jonas still has the stale row and clicks Claim.
    const res = await a.request.post(`/api/leads/${id}/claim`, { data: {} });
    expect(res.status()).toBe(200);
    await expect(async () => {
      await b
        .locator(`[data-lead-id="${id}"]`)
        .getByTestId('claim-button')
        .click({ timeout: 2000 });
      await expect(b.getByText(/Claimed by Anna Weber/)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
  });
});
