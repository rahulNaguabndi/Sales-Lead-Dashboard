import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email = 'sofia.rossi@eurodrive.test') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(inbox|dashboard)/);
}

/**
 * The inbox opens as a board by default and remembers the last view per browser. Specs that
 * work with table rows (data-lead-row) pin the table view before any page loads.
 */
export async function preferTableView(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('leaddesk:inbox-view', 'table');
    } catch {
      // ignore
    }
  });
}
