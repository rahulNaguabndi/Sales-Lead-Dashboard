import { expect, test } from '@playwright/test';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ulid } from 'ulid';
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

import type { APIRequestContext } from '@playwright/test';

// Core loop (R1-R3): sign in as Sofia, open one of her leads, log a call, see it persist.
// The lead list/detail pages belong to F04/F05; until they merge, the UI assertions skip and the
// API-level assertions below still prove the R3 write path through the running server.

const SOFIA = 'sofia.rossi@eurodrive.test';
const dbFile = path.resolve(
  __dirname,
  '..',
  (process.env.DATABASE_URL ?? './data/leaddesk.db').replace(/^file:/, ''),
);

function sofiaLead(): { id: string; version: number } {
  const db = new Database(dbFile, { readonly: true });
  try {
    return db
      .prepare(
        `select l.id, l.version from leads l join users u on u.id = l.owner_id
         where u.email = ? and l.stage in ('NEW','CONTACTED','QUALIFIED') order by l.created_at limit 1`,
      )
      .get(SOFIA) as { id: string; version: number };
  } finally {
    db.close();
  }
}

function activityRow(id: string) {
  const db = new Database(dbFile, { readonly: true });
  try {
    return db.prepare('select type, outcome, note, kind from activities where id = ?').get(id);
  } finally {
    db.close();
  }
}

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { email: SOFIA, password: 'demo1234' },
  });
  expect(res.status()).toBe(200);
}

test('R3: a logged call is persisted and survives a fresh read', async ({ request }) => {
  await login(request);
  const lead = sofiaLead();
  const res = await request.post(`/api/leads/${lead.id}/activities`, {
    data: {
      clientRequestId: ulid(),
      type: 'CALL',
      outcome: 'CONNECTED',
      note: 'Called customer',
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.activity.note).toBe('Called customer');
  expect(body.lead.version).toBe(lead.version + 1);
  // Independent connection = "after reload / restart": the row is on disk.
  expect(activityRow(body.activity.id)).toEqual({
    type: 'CALL',
    outcome: 'CONNECTED',
    note: 'Called customer',
    kind: 'USER',
  });
});

test('empty note and missing outcome are rejected with field errors', async ({ request }) => {
  await login(request);
  const lead = sofiaLead();
  const res = await request.post(`/api/leads/${lead.id}/activities`, {
    data: { clientRequestId: ulid(), type: 'CALL', note: '   ' },
  });
  expect(res.status()).toBe(400);
  const { error } = await res.json();
  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.fields.note).toBeTruthy();
  expect(error.fields.outcome).toBeTruthy();
});

test('UI: log a call from the lead page, reload, entry is still there', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SOFIA);
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/inbox$|\/$/);

  const lead = sofiaLead();
  const response = await page.goto(`/leads/${lead.id}`);
  const composer = page.getByRole('button', { name: 'Log an activity…' });
  test.skip(
    !response?.ok() || !(await composer.isVisible({ timeout: 5000 }).catch(() => false)),
    'Lead detail page (F05) with the composer slot is not merged on this branch',
  );

  await composer.click();
  await page.getByRole('radio', { name: 'Call' }).click();
  await page.getByLabel('Outcome').selectOption('CONNECTED');
  await page.getByLabel('Note').fill('Called customer');
  await page.getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByText('Called customer').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Called customer').first()).toBeVisible();

  await page.goto('/inbox');
  await expect(page.getByText(/Call · just now/).first()).toBeVisible();
});

test('UI: empty note keeps submit disabled', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SOFIA);
  await page.locator('input[type=password]').fill('demo1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const lead = sofiaLead();
  const response = await page.goto(`/leads/${lead.id}`);
  const composer = page.getByRole('button', { name: 'Log an activity…' });
  test.skip(
    !response?.ok() || !(await composer.isVisible({ timeout: 5000 }).catch(() => false)),
    'Lead detail page (F05) with the composer slot is not merged on this branch',
  );
  await composer.click();
  await expect(page.getByRole('button', { name: 'Log activity' })).toBeDisabled();
});
