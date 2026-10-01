const { chromium } = require('playwright'); const path = require('path');
const OUT = path.join(__dirname, 'shots'); const WEB = 'http://localhost:3000'; const HIDE = 'nextjs-portal{display:none!important}';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' });
  await ctx.request.post(`${WEB}/api/auth/login`, { data: { email: 'lukas.becker@eurodrive.test', password: 'demo1234' } });
  const p = await ctx.newPage(); const snap = async (n, w) => { await p.waitForTimeout(w); await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot', n); };
  await p.goto(WEB + '/inbox'); await p.addStyleTag({ content: HIDE });
  await p.getByRole('button', { name: 'Table view' }).click(); await p.waitForTimeout(1500);
  const boxes = p.locator('tbody input[type="checkbox"], tbody [role="checkbox"]');
  for (let i = 0; i < 3; i++) await boxes.nth(i).click();
  await p.locator('[aria-label="Bulk actions"]').getByRole('button').first().click();
  await p.getByRole('listbox', { name: 'Reps' }).getByRole('option').first().waitFor({ timeout: 10000 }).catch(() => {});
  await snap('bulk-assign-open', 1200); await p.keyboard.press('Escape');
  await p.goto(WEB + '/leads/01M3RX0QR08MW8F68B5GPH2EQE'); await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(2000);
  await p.mouse.wheel(0, 380); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Reschedule' }).first().click().catch(() => p.getByRole('button', { name: 'Schedule' }).first().click());
  await snap('schedule-popover2', 1000);
  await b.close();
})();
