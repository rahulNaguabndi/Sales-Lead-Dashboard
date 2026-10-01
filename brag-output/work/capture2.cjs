// Final capture: real showroom -> inbox flow on the local dev apps.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const WEB = 'http://localhost:3000';
const SHOW = 'http://localhost:3001';
const HIDE = 'nextjs-portal{display:none!important}';

async function login(ctx, email) {
  const r = await ctx.request.post(`${WEB}/api/auth/login`, { data: { email, password: 'demo1234' } });
  if (!r.ok()) throw new Error(`login ${email} ${r.status()}`);
}

(async () => {
  const browser = await chromium.launch();
  const opts = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' };
  const snap = async (target, name, wait = 900) => {
    await new Promise((r) => setTimeout(r, wait));
    await target.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot', name);
  };

  // Manager inbox open first, so the live update lands while we watch.
  const mctx = await browser.newContext(opts);
  await login(mctx, 'lukas.becker@eurodrive.test');
  const mp = await mctx.newPage();
  await mp.goto(WEB + '/inbox');
  await mp.addStyleTag({ content: HIDE });
  await mp.getByRole('button', { name: 'Table view' }).click();
  await mp.getByRole('tab', { name: /^Team/ }).click().catch(() => {});
  await snap(mp, 'inbox-table-before', 1500);

  // Showroom: a buyer enquires about the Luma EV.
  const sctx = await browser.newContext(opts);
  const sp = await sctx.newPage();
  await sp.goto(SHOW);
  await sp.getByRole('button', { name: "I'm interested in the Luma EV" }).click();
  await sp.fill('#f-firstName', 'Marta');
  await sp.fill('#f-lastName', 'Vogel');
  await sp.fill('#f-email', 'marta.vogel@example.test');
  await sp.locator('#f-phoneDigits, input[inputmode="tel"]').first().fill('1701234567');
  await sp.fill('#f-city', 'Munich');
  await sp.getByRole('radio', { name: 'WhatsApp' }).click().catch(() => sp.getByRole('button', { name: 'WhatsApp' }).click());
  await sp.selectOption('#f-bestTime', 'EVENING');
  await snap(sp, 'showroom-form-filled');
  await sp.getByRole('button', { name: 'Send enquiry' }).click();
  await sp.waitForURL(/thank-you/, { timeout: 15000 }).catch(() => {});
  await snap(sp, 'showroom-thanks', 1200);

  // Live update in the manager's inbox.
  await mp.getByText('Marta Vogel').first().waitFor({ timeout: 20000 }).catch(() => console.log('no live row yet'));
  await snap(mp, 'inbox-table-after', 800);
  const row = mp.locator('tr', { hasText: 'Marta Vogel' }).first();
  if (await row.count()) await snap(row, 'inbox-row-new', 0);

  // Lead detail of the new lead.
  await mp.getByText('Marta Vogel').first().click();
  await mp.waitForURL(/\/leads\//);
  await mp.addStyleTag({ content: HIDE });
  await snap(mp, 'new-lead-detail', 2000);
  const ai = mp.getByRole('region', { name: 'AI assist' }).or(mp.locator('[aria-label="AI assist"]')).first();
  await ai.scrollIntoViewIfNeeded();
  await mp.getByRole('button', { name: 'Suggest next step' }).click();
  await mp.getByTestId('ai-summary').waitFor({ timeout: 20000 });
  await snap(ai, 'ai-card', 800);
  await snap(mp, 'new-lead-ai-page', 0);
  const score = mp.locator('text=Lead score').first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]');
  await score.scrollIntoViewIfNeeded();
  await snap(score, 'score-card', 400);

  // Pipeline + VP dashboard without the dev overlay.
  await mp.goto(WEB + '/pipeline');
  await mp.addStyleTag({ content: HIDE });
  await snap(mp, 'pipeline', 2000);
  const vctx = await browser.newContext(opts);
  await login(vctx, 'isabelle.laurent@eurodrive.test');
  const vp = await vctx.newPage();
  await vp.goto(WEB + '/dashboard');
  await vp.addStyleTag({ content: HIDE });
  await snap(vp, 'vp-dashboard', 2500);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
