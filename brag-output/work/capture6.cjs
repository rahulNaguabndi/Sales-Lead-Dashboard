const { chromium } = require('playwright'); const path = require('path');
const OUT = path.join(__dirname, 'shots'); const WEB = 'http://localhost:3000'; const HIDE = 'nextjs-portal{display:none!important}';
(async () => {
  const b = await chromium.launch(); const opts = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' };
  // Showroom home, scrolled to the model grid
  const sc = await b.newContext(opts); const sp = await sc.newPage();
  await sp.goto('http://localhost:3001/'); await sp.waitForTimeout(800);
  await sp.mouse.wheel(0, 470); await sp.waitForTimeout(800);
  await sp.screenshot({ path: path.join(OUT, 'showroom-models.png') }); console.log('shot showroom-models');
  const box = await sp.getByRole('button', { name: "I'm interested in the Luma EV" }).boundingBox(); console.log('luma btn', JSON.stringify(box));
  // AI card on two leads
  const ctx = await b.newContext(opts);
  await ctx.request.post(`${WEB}/api/auth/login`, { data: { email: 'lukas.becker@eurodrive.test', password: 'demo1234' } });
  const p = await ctx.newPage();
  for (const [id, name] of [['01M3RX0QR08MW8F68B5GPH2EQE', 'boris'], ['01M3S11CAH5MEG4KWTMSTRJ4J2', 'sara']]) {
    await p.goto(WEB + '/leads/' + id); await p.addStyleTag({ content: HIDE }); await p.waitForTimeout(1800);
    const card = p.locator('[aria-label="AI assist"]').first(); await card.scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: 'Suggest next step' }).click();
    await p.getByTestId('ai-summary').waitFor({ timeout: 20000 });
    await p.getByRole('button', { name: 'Draft message' }).click();
    await p.getByLabel('Draft message').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
    await card.screenshot({ path: path.join(OUT, `ai-full-${name}.png`) }); console.log('shot ai', name, await p.getByTestId('ai-summary').innerText());
  }
  await b.close();
})();
