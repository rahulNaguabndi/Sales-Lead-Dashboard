import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email = 'sofia.rossi@eurodrive.test') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(inbox|dashboard)/);
}
