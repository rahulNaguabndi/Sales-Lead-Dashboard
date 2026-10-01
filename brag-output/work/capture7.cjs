const { chromium } = require('playwright'); const path = require('path');
const WEB = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, colorScheme: 'dark' });
  await ctx.request.post(`${WEB}/api/auth/login`, { data: { email: 'lukas.becker@eurodrive.test', password: 'demo1234' } });
  const p = await ctx.newPage(); await p.goto(WEB + '/leads/01M3XXXX'.replace('01M3XXXX', process.argv[2]));
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: 'Edit preferences' }).click(); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(__dirname, 'shots', 'prefs-dialog-marta.png') });
  const bb = await p.getByRole('dialog').boundingBox(); console.log(JSON.stringify(bb));
  await b.close();
})();
