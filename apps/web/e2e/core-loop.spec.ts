import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Core loop (R1 -> R2 -> R3). F04 owns the inbox steps; F05/F06 append the detail and logging steps.

test('core loop: Sofia lands in the inbox and opens her most urgent lead', async ({ page }) => {
  await signIn(page);
  await page.goto('/inbox');
  await expect(page.getByTestId('tab-mine')).toHaveAttribute('aria-selected', 'true');
  const rows = page.locator('[data-lead-row]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThanOrEqual(1);

  const id = await rows.first().getAttribute('data-lead-id');
  await rows.first().click(); // 1 click from the inbox: SC-002
  await expect(page).toHaveURL(new RegExp(`/leads/${id}$`));
  // F05/F06 append: log activity, timeline, reload, back to inbox.
});
