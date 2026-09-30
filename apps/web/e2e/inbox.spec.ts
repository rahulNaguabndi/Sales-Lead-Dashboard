import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.describe('inbox', () => {
  test('rep sees tabs with counts, only own rows, paginated', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    for (const t of ['mine', 'unassigned', 'due_today', 'going_cold'])
      await expect(page.getByTestId(`tab-${t}`)).toBeVisible();
    await expect(page.getByTestId('tab-team')).toHaveCount(0);
    await expect(page.locator('[data-lead-row]').first()).toBeVisible();
    await expect(page.getByTestId('inbox-total')).toContainText('lead');
    // Owner column is hidden on My Leads.
    await expect(page.getByRole('columnheader', { name: 'Owner' })).toHaveCount(0);
  });

  test('filters persist in the URL across reload and Clear keeps the tab', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox?view=unassigned&stage=NEW&priority=HOT');
    await expect(page.getByTestId('tab-unassigned')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('chip-filter-stage')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('chip-filter-stage')).toBeVisible();
    await expect(page.getByTestId('chip-filter-priority')).toBeVisible();
    await page.getByTestId('clear-filters').click();
    await expect(page).toHaveURL(/view=unassigned/);
    await expect(page).not.toHaveURL(/stage=/);
  });

  test('search debounces into the URL and narrows results', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    // Retry: typing before hydration (now slower with the live-update provider) is dropped.
    await expect(async () => {
      await page.getByTestId('inbox-search').fill('conti');
      await expect(page).toHaveURL(/q=conti/, { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await expect(page.locator('[data-lead-row]').first()).toContainText('Conti');
  });

  test('bad params are ignored and the default view shows', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox?stage=NOPE&page=zzz');
    await expect(page.locator('[data-lead-row]').first()).toBeVisible();
  });

  test('keyboard: ArrowDown moves focus, Enter opens the lead', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    const rows = page.locator('[data-lead-row]');
    await expect(async () => {
      await rows.first().focus();
      await page.keyboard.press('ArrowDown');
      await expect(rows.nth(1)).toBeFocused({ timeout: 1000 });
    }).toPass({ timeout: 15000 });
    const id = await rows.nth(1).getAttribute('data-lead-id');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/leads/${id}$`));
  });

  test('"/" focuses search', async ({ page }) => {
    await signIn(page);
    await page.goto('/inbox');
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.getByTestId('inbox-search')).toBeFocused();
  });

  test('API never leaks out-of-scope leads', async ({ page }) => {
    await signIn(page);
    const res = await page.request.get('/api/leads?owner=does-not-exist&view=team&pageSize=50');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const owners = new Set(
      body.items.map((i: { owner: { name: string } | null }) => i.owner?.name),
    );
    expect([...owners].every((o) => o === 'Sofia Rossi' || o === undefined)).toBe(true);
  });

  test('manager sees Team tab and owner filter; VP sees All', async ({ page, context }) => {
    await signIn(page, 'lukas.becker@eurodrive.test');
    await page.goto('/inbox');
    await expect(page.getByTestId('tab-team')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('filters-trigger').click();
    await expect(page.getByRole('group', { name: 'Owner' })).toBeVisible();
    await context.clearCookies();
    await signIn(page, 'isabelle.laurent@eurodrive.test');
    await page.goto('/inbox');
    await expect(page.getByTestId('tab-team')).toContainText('All');
  });
});
