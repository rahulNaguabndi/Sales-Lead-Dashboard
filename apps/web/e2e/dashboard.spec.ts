import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.describe('dashboards', () => {
  test('manager sees KPI tiles and the rep leaderboard', async ({ page }) => {
    await signIn(page, 'lukas.becker@eurodrive.test');
    await page.goto('/dashboard');
    await expect(page.getByTestId('kpi-row')).toBeVisible();
    await expect(page.getByTestId('kpi-new-leads')).toBeVisible();
    await expect(page.getByTestId('widget-rep-leaderboard')).toBeVisible();
    await expect(page.getByTestId('widget-funnel')).toBeVisible();
  });

  test('leaderboard overdue cell drills down to the inbox', async ({ page }) => {
    await signIn(page, 'lukas.becker@eurodrive.test');
    await page.goto('/dashboard');
    await expect(page.getByTestId('widget-rep-leaderboard').locator('table')).toBeVisible();
    const link = page.locator('[data-testid^="cell-"][data-testid$="-overdue"] a').first();
    if ((await link.count()) === 0) test.skip(true, 'No rep with overdue follow-ups in seed data');
    await link.click();
    await expect(page).toHaveURL(/\/inbox\?.*overdue=1/);
  });

  test('VP sees team comparison', async ({ page }) => {
    await signIn(page, 'isabelle.laurent@eurodrive.test');
    await page.goto('/dashboard');
    await expect(page.getByTestId('widget-team-comparison')).toBeVisible();
  });

  test('rep sees a personal view without leaderboard', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard');
    await expect(page.getByTestId('kpi-row')).toBeVisible();
    await expect(page.getByTestId('widget-rep-leaderboard')).toHaveCount(0);
  });
});
