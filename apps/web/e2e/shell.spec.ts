import { expect, test } from '@playwright/test';

test('app shell shows the role-aware navigation rail and top bar', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  for (const label of ['Inbox', 'Pipeline', 'Dashboard', 'Offers', 'Team Settings', 'Audit']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  const box = await nav.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(56);
  await expect(page.getByPlaceholder('Search leads (⌘K)')).toBeVisible();
  await expect(page.getByText(/\d+ leads loaded/)).toBeVisible();
});

test('activities route is stubbed with 501 until F05/F06', async ({ request }) => {
  const res = await request.get('/api/leads/any/activities');
  expect(res.status()).toBe(501);
  expect((await res.json()).error.code).toBe('NOT_IMPLEMENTED');
});
