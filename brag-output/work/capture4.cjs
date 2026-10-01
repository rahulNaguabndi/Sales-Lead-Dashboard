// Capture: history, contact preferences, manager assign (single + bulk), follow-ups, activity logging.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const WEB = 'http://localhost:3000';
const HIDE = 'nextjs-portal{display:none!important}';

async function login(ctx, email) {
  const r = await ctx.request.post(`${WEB}/api/auth/login`, { data: { email, password: 'demo1234' } });
  if (!r.ok()) throw new Error(`login ${email} ${r.status()}`);
}
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };

(async () => {
  const browser = await chromium.launch();
  const opts = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' };
  const snap = async (target, name, wait = 900) => {
    await new Promise((r) => setTimeout(r, wait));
    await target.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot', name);
  };
  const go = async (p, url) => { await p.goto(WEB + url); await p.addStyleTag({ content: HIDE }); };

  // --- Rep view: today's follow-ups
  const rctx = await browser.newContext(opts);
  await login(rctx, 'sofia.rossi@eurodrive.test');
  const rp = await rctx.newPage();
  await go(rp, '/inbox');
  await snap(rp, 'rep-inbox', 2000);
  await step('rep widget', async () => snap(rp.getByRole('region', { name: "Today's follow-ups" }).or(rp.locator('[aria-label="Today\'s follow-ups"]')).first(), 'rep-followups', 200));

  // --- Manager
  const mctx = await browser.newContext(opts);
  await login(mctx, 'lukas.becker@eurodrive.test');
  const mp = await mctx.newPage();

  // Lead with a rich history
  await go(mp, '/inbox');
  await mp.getByRole('button', { name: 'Table view' }).click();
  await mp.waitForTimeout(1200);
  await mp.locator('a', { hasText: 'Boris Scheer' }).first().click();
  await mp.waitForURL(/\/leads\//);
  await mp.addStyleTag({ content: HIDE });
  await snap(mp, 'history-lead', 2200);
  console.log('history url', mp.url());

  await step('prefs dialog', async () => {
    await mp.getByRole('button', { name: 'Edit preferences' }).click();
    await snap(mp, 'prefs-dialog', 900);
    await snap(mp.getByRole('dialog'), 'prefs-dialog-el', 0);
    await mp.keyboard.press('Escape');
  });
  await step('schedule popover', async () => {
    await mp.getByRole('button', { name: 'Schedule' }).first().click();
    await snap(mp, 'schedule-popover', 900);
    await mp.keyboard.press('Escape');
  });

  // Bulk assign in the inbox
  await step('bulk', async () => {
    await go(mp, '/inbox');
    await mp.getByRole('button', { name: 'Table view' }).click();
    await mp.waitForTimeout(1500);
    const boxes = mp.locator('tbody input[type="checkbox"], tbody [role="checkbox"]');
    for (let i = 0; i < 3; i++) await boxes.nth(i).click();
    await snap(mp, 'bulk-selected', 700);
    const bar = mp.locator('[aria-label="Bulk actions"]');
    await bar.getByRole('button').first().click();
    await snap(mp, 'bulk-assign-open', 1000);
    await mp.keyboard.press('Escape');
  });

  // Marta: assign to a rep, then log a WhatsApp activity with a follow-up
  await step('assign marta', async () => {
    await go(mp, '/inbox');
    await mp.getByRole('tab', { name: /Unassigned/ }).click();
    await mp.waitForTimeout(1200);
    await mp.locator('a', { hasText: 'Marta Vogel' }).first().click();
    await mp.waitForURL(/\/leads\//);
    await mp.addStyleTag({ content: HIDE });
    await mp.waitForTimeout(1500);
    await mp.getByRole('button', { name: /Assign to/ }).click();
    await snap(mp, 'assign-open', 1000);
    const opt = mp.getByRole('listbox', { name: 'Reps' }).getByRole('option').filter({ hasText: 'Sofia' }).first();
    if (await opt.count()) await opt.click(); else await mp.getByRole('listbox', { name: 'Reps' }).getByRole('option').first().click();
    await mp.waitForTimeout(800);
    const confirm = mp.getByRole('button', { name: /^(Assign|Confirm|Reassign)/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
    await snap(mp, 'assigned-after', 1800);
  });
  await step('log activity', async () => {
    await mp.getByText('Log an activity').first().click();
    await mp.waitForTimeout(500);
    await mp.getByRole('radio', { name: 'WhatsApp' }).click();
    await mp.fill('#composer-note', 'Sent Luma EV brochure on WhatsApp. Wants an evening test drive.');
    const outcome = mp.locator('select').filter({ has: mp.locator('option', { hasText: 'Select outcome' }) }).first();
    if (await outcome.count()) { const v = await outcome.locator('option').nth(1).getAttribute('value'); await outcome.selectOption(v); }
    await mp.getByRole('group', { name: 'Follow-up time' }).getByRole('button', { name: 'Tomorrow 10:00' }).click().catch(() => mp.getByRole('button', { name: 'Tomorrow 10:00' }).first().click());
    await snap(mp, 'composer-filled', 700);
    await mp.getByRole('button', { name: 'Log activity' }).click();
    await snap(mp, 'logged-after', 2200);
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
