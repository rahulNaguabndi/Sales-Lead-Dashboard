import { expect, test } from '@playwright/test';
import path from 'node:path';
import Database from 'better-sqlite3';
import { signIn } from './helpers';

function dbRows() {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  const conn = new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
  try {
    const jonas = conn
      .prepare('SELECT id FROM users WHERE email = ?')
      .get('jonas.fischer@eurodrive.test') as { id: string };
    const lead = conn
      .prepare(
        `SELECT l.id FROM leads l JOIN users u ON u.id = l.owner_id
         WHERE u.email = ? AND l.stage NOT IN ('WON','LOST') LIMIT 1`,
      )
      .get('anna.weber@eurodrive.test') as { id: string };
    return { jonasId: jonas.id, leadId: lead.id };
  } finally {
    conn.close();
  }
}

test.describe('audit log (F19)', () => {
  test('manager reassigns a lead and finds the owner diff in the audit trail', async ({ page }) => {
    const { jonasId, leadId } = dbRows();
    await signIn(page, 'lukas.becker@eurodrive.test');
    const res = await page.request.post(`/api/leads/${leadId}/assign`, {
      data: { toUserId: jonasId },
    });
    expect(res.status()).toBe(200);

    await page.goto(`/leads/${leadId}`);
    await page.getByTestId('audit-trail-link').click();
    await expect(page).toHaveURL(new RegExp(`/audit\\?entity=lead&entityId=${leadId}`));

    const row = page.getByTestId('audit-row').filter({ hasText: 'Lead assigned' }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('Jonas Fischer');
    await row.getByRole('button', { name: /Expand details/ }).click();
    await expect(page.getByTestId('audit-diff')).toContainText('Owner');
  });

  test('rep has no Audit nav item and gets 403 on the page', async ({ page }) => {
    await signIn(page, 'sofia.rossi@eurodrive.test');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Audit')).toHaveCount(0);
    await page.goto('/audit');
    await expect(page.getByText('403')).toBeVisible();
  });
});
