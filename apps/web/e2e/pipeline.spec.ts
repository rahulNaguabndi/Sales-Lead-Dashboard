import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const EMAIL = 'sofia.rossi@eurodrive.test';

function leadInStage(stage: string): { id: string } {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  const conn = new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
  try {
    const row = conn
      .prepare(
        `SELECT l.id FROM leads l JOIN users u ON u.id = l.owner_id
         WHERE u.email = ? AND l.stage = ? ORDER BY l.score DESC LIMIT 1`,
      )
      .get(EMAIL, stage) as { id: string } | undefined;
    if (!row) throw new Error(`no ${stage} lead owned by ${EMAIL} in the seed data`);
    return row;
  } finally {
    conn.close();
  }
}

test('US1: changing the stage on the detail page persists after reload', async ({ page }) => {
  const lead = leadInStage('CONTACTED');
  await signIn(page, EMAIL);
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: 'Change stage' }).click();
  await page.getByRole('menuitem', { name: 'Qualified' }).click();
  await expect(page.getByText('Moved to Qualified')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change stage' })).toContainText('Qualified');
});

test('US6: dragging a card QUALIFIED -> TEST_DRIVE persists after reload', async ({ page }) => {
  const lead = leadInStage('QUALIFIED');
  await signIn(page, EMAIL);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/pipeline');
  const card = page.getByTestId(`kanban-card-${lead.id}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  const target = page.getByTestId('kanban-col-TEST_DRIVE').locator('header');
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height + 20, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByText('Moved to Test drive')).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId('kanban-col-TEST_DRIVE').getByTestId(`kanban-card-${lead.id}`),
  ).toBeVisible();
});
