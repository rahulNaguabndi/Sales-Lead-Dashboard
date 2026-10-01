// Exploratory + final capture of the real running apps (localhost only).
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
const WEB = 'http://localhost:3000';
const SHOW = 'http://localhost:3001';

async function login(ctx, email) {
  const r = await ctx.request.post(`${WEB}/api/auth/login`, { data: { email, password: 'demo1234' } });
  if (!r.ok()) throw new Error(`login ${email} ${r.status()}`);
}

(async () => {
  const browser = await chromium.launch();
  const opts = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' };
  const shot = async (page, name) => {
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('shot', name);
  };

  // Showroom
  const sctx = await browser.newContext(opts);
  const sp = await sctx.newPage();
  await sp.goto(SHOW);
  await shot(sp, 'showroom-home');
  await sp.getByRole('button', { name: /I'm interested/ }).first().click();
  await shot(sp, 'showroom-form');

  // Manager
  const mctx = await browser.newContext(opts);
  await login(mctx, 'lukas.becker@eurodrive.test');
  const mp = await mctx.newPage();
  for (const [p, n] of [['/inbox', 'inbox'], ['/pipeline', 'pipeline'], ['/dashboard', 'dashboard']]) {
    await mp.goto(WEB + p);
    await shot(mp, 'mgr-' + n);
  }
  await mp.goto(WEB + '/inbox');
  await mp.waitForTimeout(1000);
  const href = await mp.locator('a[href^="/leads/"]').first().getAttribute('href');
  console.log('lead', href);
  await mp.goto(WEB + href);
  await shot(mp, 'lead-detail');
  await mp.mouse.wheel(0, 700);
  await shot(mp, 'lead-detail-2');

  // VP
  const vctx = await browser.newContext(opts);
  await login(vctx, 'isabelle.laurent@eurodrive.test');
  const vp = await vctx.newPage();
  for (const [p, n] of [['/dashboard', 'dashboard'], ['/dashboard/demographics', 'demographics'], ['/audit', 'audit']]) {
    await vp.goto(WEB + p);
    await shot(vp, 'vp-' + n);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
