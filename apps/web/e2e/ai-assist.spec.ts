import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const SOFIA = 'sofia.rossi@eurodrive.test';

function openLeadWithPhone(): string {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  const db = new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
  try {
    const row = db
      .prepare(
        `SELECT l.id FROM leads l JOIN customers c ON c.id = l.customer_id JOIN users u ON u.id = l.owner_id
         WHERE u.email = ? AND c.phone IS NOT NULL AND l.stage NOT IN ('WON','LOST') LIMIT 1`,
      )
      .get(SOFIA) as { id: string };
    return row.id;
  } finally {
    db.close();
  }
}

// Runs without ANTHROPIC_API_KEY: the card must fall back to rules and still work end to end.
test('AI assist: rule-based card, draft prefills the composer', async ({ page }) => {
  await signIn(page);
  await page.goto(`/leads/${openLeadWithPhone()}`);
  const card = page.getByLabel('AI assist');
  await expect(card.getByTestId('ai-summary')).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId('ai-source')).toHaveText(/Rule-based|AI-generated/);
  await expect(card.getByTestId('ai-nba')).toBeVisible();

  await card.getByRole('button', { name: 'Draft message' }).click();
  const textarea = card.getByLabel('Draft message');
  await expect(textarea).not.toHaveValue('');
  const text = await textarea.inputValue();
  await page.context().route('**/wa.me/**', (r) => r.abort());
  await page.context().route('**/api.whatsapp.com/**', (r) => r.abort());
  await card.getByRole('button', { name: 'Use draft' }).click();
  // Composer is prefilled with the draft; nothing is saved until the rep submits.
  await expect(page.getByRole('textbox', { name: /note/i }).first()).toHaveValue(text);
});
