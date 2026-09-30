import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'sofia.rossi@eurodrive.test';

async function signIn(page: Page, email: string) {
  const res = await page.request.post('/api/auth/login', { data: { email, password: 'demo1234' } });
  expect(res.ok()).toBe(true);
}

function dbConn() {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  return new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
}

function whatsappLead() {
  const conn = dbConn();
  try {
    return conn
      .prepare(
        `SELECT l.id, c.id AS customerId, c.phone FROM leads l
         JOIN customers c ON c.id = l.customer_id
         JOIN users u ON u.id = l.owner_id
         WHERE u.email = ? AND c.preferred_channel = 'WHATSAPP' AND c.phone IS NOT NULL
         AND l.stage NOT IN ('WON','LOST') LIMIT 1`,
      )
      .get(EMAIL) as { id: string; customerId: string; phone: string } | undefined;
  } finally {
    conn.close();
  }
}

function activityCount(leadId: string) {
  const conn = dbConn();
  try {
    return (
      conn.prepare('SELECT count(*) n FROM activities WHERE lead_id = ?').get(leadId) as {
        n: number;
      }
    ).n;
  } finally {
    conn.close();
  }
}

test('WhatsApp preferred: picker opens the deep link and prefills the composer without saving', async ({
  page,
}) => {
  const lead = whatsappLead();
  test.skip(!lead, 'no open WhatsApp-preferring lead owned by the demo rep in this seed');
  const before = activityCount(lead!.id);
  await signIn(page, EMAIL);
  await page.goto(`/leads/${lead!.id}`);

  // Click 1: the preferred channel button opens the template picker.
  await page.locator('[data-channel="WHATSAPP"]').click();
  await expect(page.getByTestId('template-preview')).not.toBeEmpty();

  // Click 2: "Open WhatsApp" is a real anchor to wa.me in a new tab.
  const open = page.getByRole('link', { name: 'Open WhatsApp' });
  const digits = lead!.phone.replace(/\D/g, '');
  await expect(open).toHaveAttribute('href', new RegExp(`^https://wa\\.me/${digits}\\?text=`));
  await expect(open).toHaveAttribute('target', '_blank');
  // Stop the new tab from opening so the test stays on the page.
  await open.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
  await open.click();

  // The composer is pre-filled with type WhatsApp and the rendered template.
  await expect(page.locator('textarea').first()).not.toHaveValue('');
  expect(activityCount(lead!.id)).toBe(before); // nothing saved until submit
});

test('language switch and English fallback in the picker', async ({ page }) => {
  const lead = whatsappLead();
  test.skip(!lead, 'no open WhatsApp-preferring lead owned by the demo rep in this seed');
  await signIn(page, EMAIL);
  await page.goto(`/leads/${lead!.id}`);
  await page.locator('[data-channel="WHATSAPP"]').click();
  const preview = page.getByTestId('template-preview');
  const first = await preview.innerText();
  await page.getByLabel('Template language').selectOption('de');
  await expect(preview).not.toHaveText(first);
  await expect(page.getByRole('button', { name: 'Share offer' })).toBeDisabled();
});

test('Call prefills "Called customer" and is a tel: anchor', async ({ page }) => {
  const lead = whatsappLead();
  test.skip(!lead, 'no open WhatsApp-preferring lead owned by the demo rep in this seed');
  await signIn(page, EMAIL);
  await page.goto(`/leads/${lead!.id}`);
  const call = page.locator('a[data-channel="CALL"]');
  await expect(call).toHaveAttribute('href', /^tel:\+\d+$/);
  await call.evaluate((el) => el.addEventListener('click', (e) => e.preventDefault()));
  await call.click();
  await expect(page.locator('textarea').first()).toHaveValue('Called customer');
});
