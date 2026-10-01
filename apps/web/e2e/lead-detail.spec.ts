import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type APIRequestContext } from '@playwright/test';

function db() {
  const url = process.env.DATABASE_URL ?? './data/leaddesk.db';
  return new Database(path.resolve(process.cwd(), 'apps/web', url.replace(/^file:/, '')), {
    readonly: true,
  });
}

async function signIn(request: APIRequestContext, email: string) {
  const res = await request.post('/api/auth/login', { data: { email, password: 'demo1234' } });
  expect(res.ok()).toBe(true);
}

function leadFor(ownerEmail: string, inScope: boolean) {
  const conn = db();
  try {
    const owner = conn.prepare('SELECT id, team_id FROM users WHERE email = ?').get(ownerEmail) as {
      id: string;
      team_id: string;
    };
    const row = conn
      .prepare(
        inScope
          ? `SELECT l.id, l.reference FROM leads l WHERE l.owner_id = ?
             AND (SELECT count(*) FROM activities a WHERE a.lead_id = l.id) >= 3 LIMIT 1`
          : `SELECT l.id, l.reference FROM leads l WHERE l.owner_id IS NOT NULL AND l.team_id != ? LIMIT 1`,
      )
      .get(inScope ? owner.id : owner.team_id) as { id: string; reference: string };
    return row;
  } finally {
    conn.close();
  }
}

test('rep opens a lead: newest activity first, toggle works, reload resets to newest', async ({
  page,
}) => {
  const email = 'sofia.rossi@eurodrive.test';
  await signIn(page.request, email);
  const lead = leadFor(email, true);
  await page.goto(`/leads/${lead.id}`);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.getByText(lead.reference).first()).toBeVisible();

  const feed = page.getByRole('feed');
  const firstEntry = () => feed.locator('time').first().getAttribute('datetime');
  const newestFirst = await firstEntry();
  await page.getByRole('button', { name: 'Newest first' }).click();
  await expect(page.getByRole('button', { name: 'Oldest first' })).toBeVisible();
  await expect.poll(firstEntry).not.toBe(newestFirst);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Newest first' })).toBeVisible();
  await expect.poll(firstEntry).toBe(newestFirst);
});

test('out-of-scope deep link shows the not-found page', async ({ page }) => {
  const email = 'sofia.rossi@eurodrive.test';
  await signIn(page.request, email);
  const other = leadFor(email, false);
  const res = await page.goto(`/leads/${other.id}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/isn.t assigned to you or your team/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to inbox' })).toBeVisible();
});

test('activities API: 401 when signed out, 404 for unknown ids', async ({ request }) => {
  const anon = await request.get('/api/leads/01HZX0000000000000000000AA/activities');
  expect(anon.status()).toBe(401);
  await signIn(request, 'sofia.rossi@eurodrive.test');
  const res = await request.get('/api/leads/any/activities');
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe('NOT_FOUND');
});
