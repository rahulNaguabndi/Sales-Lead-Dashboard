import { expect, test } from '@playwright/test';
import path from 'node:path';
import Database from 'better-sqlite3';
import { signIn, preferTableView } from './helpers';

test.beforeEach(async ({ page }) => preferTableView(page));

// The seed gives reps more open leads than max_open_leads, so claims would hit the limit. Raise
// the caps for this file only and put the previous values back afterwards: leaving 1000 in the
// shared dev database is what made Team settings show "Max open 1000" for everyone.
const dbPath = () =>
  path.resolve(
    process.cwd(),
    'apps/web',
    (process.env.DATABASE_URL ?? './data/leaddesk.db').replace(/^file:/, ''),
  );
let savedCaps: { id: string; max_open_leads: number }[] = [];

test.beforeAll(() => {
  const conn = new Database(dbPath());
  try {
    savedCaps = conn.prepare('SELECT id, max_open_leads FROM users').all() as typeof savedCaps;
    conn.prepare('UPDATE users SET max_open_leads = 100').run();
  } finally {
    conn.close();
  }
});

test.afterAll(() => {
  const conn = new Database(dbPath());
  try {
    const restore = conn.prepare('UPDATE users SET max_open_leads = ? WHERE id = ?');
    // Older runs left 1000 behind; anything above the settings limit goes back to the default.
    conn.transaction(() => {
      for (const u of savedCaps) restore.run(u.max_open_leads > 100 ? 25 : u.max_open_leads, u.id);
    })();
  } finally {
    conn.close();
  }
});

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
    await preferTableView(b);
    await signIn(a, 'anna.weber@eurodrive.test');
    await signIn(b, 'jonas.fischer@eurodrive.test');
    await b.goto('/inbox?view=unassigned');
    // nth(1): the first row can still be the lead claimed by the previous test (stale cache).
    const id = await b.locator('[data-lead-row]').nth(1).getAttribute('data-lead-id');
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
