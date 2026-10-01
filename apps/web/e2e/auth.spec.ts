import { expect, test } from '@playwright/test';

test('signed-out visit redirects to login and returns to the page after sign-in', async ({
  page,
}) => {
  await page.goto('/inbox');
  await expect(page).toHaveURL(/\/login\?next=%2Finbox/);
  await page.getByLabel('Email').fill('sofia.rossi@eurodrive.test');
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/inbox$/);
});

test('demo persona lands on role home, then logout ends the session', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Log in as Lukas Becker/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/); // the page itself ships with F16
  await page.goto('/');
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/inbox');
  await expect(page).toHaveURL(/\/login\?next=%2Finbox/);
});

test('protected API answers 401 without a session', async ({ request }) => {
  const res = await request.get('/api/auth/me');
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
});
