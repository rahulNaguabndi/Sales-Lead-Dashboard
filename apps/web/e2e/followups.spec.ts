import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
// Both tests act on the same rep's lead; run serially so one doesn't supersede the other's follow-up.test.describe.configure({ mode: 'serial' });

const EMAIL = 'sofia.rossi@eurodrive.test';

function openLeadOf(email: string): string {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  const conn = new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
  try {
    const row = conn
      .prepare(
        `SELECT l.id FROM leads l JOIN users u ON u.id = l.owner_id
         WHERE u.email = ? AND l.stage IN ('CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION') LIMIT 1`,
      )
      .get(email) as { id: string };
    return row.id;
  } finally {
    conn.close();
  }
}

// SC-004: scheduling is open panel -> one quick pick (two clicks).
test('rep schedules Tomorrow 18:00 from the follow-up card and sees it listed', async ({
  page,
}) => {
  const res = await page.request.post('/api/auth/login', {
    data: { email: EMAIL, password: 'demo1234' },
  });
  expect(res.ok()).toBe(true);
  const leadId = openLeadOf(EMAIL);

  await page.goto(`/leads/${leadId}`);
  const card = page.getByTestId('followup-card');
  await expect(card).toBeVisible();
  // Wait for the follow-up query to settle before interacting (avoids a GET/POST race).
  await expect(card.getByTestId('followup-next').or(card.getByTestId('followup-empty'))).toBeVisible();
  await card.getByRole('button', { name: /^(Schedule|Reschedule)$/ }).click();
  await page.getByRole('button', { name: 'Tomorrow 18:00' }).click();

  await expect(card.getByTestId('followup-next')).toContainText('18:00');
  await expect(card.getByTestId('followup-cadence')).toContainText(/Attempt \d of 5|Cadence complete/);

  const upcoming = await page.evaluate(async () => {
    const r = await fetch('/api/follow-ups?view=upcoming');
    return r.json();
  });
  expect(upcoming.items.some((i: { leadId: string }) => i.leadId === leadId)).toBe(true);

  await page.goto('/inbox');
  await expect(page.getByTestId('due-today-widget')).toBeVisible();
});

test('rep can mark the follow-up done from the card', async ({ page }) => {
  await page.request.post('/api/auth/login', { data: { email: EMAIL, password: 'demo1234' } });
  const leadId = openLeadOf(EMAIL);
  await page.goto(`/leads/${leadId}`);
  const card = page.getByTestId('followup-card');
  await expect(card).toBeVisible();
  // Wait for the query to settle so we don't schedule over a follow-up that is still loading.
  await expect(
    card.getByTestId('followup-next').or(card.getByTestId('followup-empty')),
  ).toBeVisible();
  if (!(await card.getByTestId('followup-next').isVisible())) {
    await card.getByRole('button', { name: 'Schedule' }).click();
    await page.getByRole('button', { name: 'In 3 days' }).click();
    await expect(card.getByTestId('followup-next')).toBeVisible();
  }
  const patched = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/api/follow-ups/'),
  );
  await card.getByRole('button', { name: 'Done' }).click();
  expect((await patched).ok()).toBe(true);
});
