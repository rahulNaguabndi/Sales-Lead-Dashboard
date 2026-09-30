import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const VP = 'isabelle.laurent@eurodrive.test';
const MANAGER = 'lukas.becker@eurodrive.test';

test.describe('demographics', () => {
  test('VP sees three charts and the table view', async ({ page }) => {
    await signIn(page, VP);
    await page.goto('/dashboard/demographics');
    await expect(page.getByTestId('demographics-conversion')).toBeVisible();
    await expect(page.getByTestId('demographics-channel')).toBeVisible();
    await expect(page.getByTestId('demographics-models')).toBeVisible();
    await page
      .getByTestId('demographics-conversion')
      .getByRole('button', { name: 'table' })
      .click();
    await expect(page.getByTestId('demographics-conversion').getByRole('table')).toBeVisible();
  });

  test('manager has no team filter', async ({ page }) => {
    await signIn(page, MANAGER);
    await page.goto('/dashboard/demographics');
    await expect(page.getByTestId('demographics-tab')).toBeVisible();
    await expect(page.getByLabel('Team', { exact: true })).toHaveCount(0);
  });

  test('rep has no tab and the API returns 403', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/demographics');
    await expect(page.getByTestId('demographics-tab')).toHaveCount(0);
    const res = await page.request.get('/api/dashboard/demographics');
    expect(res.status()).toBe(403);
  });
});
