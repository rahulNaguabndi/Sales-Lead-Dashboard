import { expect, test, type APIRequestContext } from '@playwright/test';

async function signIn(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { email: 'isabelle.laurent@eurodrive.test', password: 'demo1234' },
  });
  expect(res.ok()).toBe(true);
}

test('app shell shows the role-aware navigation rail and top bar', async ({ page }) => {
  await signIn(page.request);
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

test('activities route is live (F05): unknown lead ids return 404', async ({ request }) => {
  await signIn(request);
  const res = await request.get('/api/leads/any/activities');
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('NOT_FOUND');
});

