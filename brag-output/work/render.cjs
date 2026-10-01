// usage: node render.cjs stills 1.2,4.6,...   |   node render.cjs full <posterTime>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname, OUTDIR = path.dirname(ROOT);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(4590, '127.0.0.1', r));
  const base = 'http://localhost:4590';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const comp = await ctx.newPage();
  await comp.goto(base + '/composition.html');
  await comp.evaluate(() => window.ready);
  const at = async (t) => { await comp.evaluate((t) => window.renderAt(t), t); };
  const [mode, arg, arg2] = process.argv.slice(2);

  if (mode === 'stills') {
    fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
    for (const t of arg.split(',').map(Number)) {
      await at(t);
      await comp.screenshot({ path: path.join(ROOT, 'stills', `t${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 85 });
    }
    console.log('stills done');
  } else if (mode === 'full') {
    const poster = Number(arg);
    const DUR = await comp.evaluate(() => window.DURATION);
    const enc = await ctx.newPage();
    enc.on('console', (m) => console.log('[enc]', m.text()));
    await enc.goto(base + '/encoder.html');
    await enc.evaluate(() => window.startVideo());
    const N = Math.round(DUR * 30);
    for (let i = 0; i < N; i++) {
      await at(i === 0 ? poster : i / 30); // frame 0 carries the poster
      const buf = await comp.screenshot({ type: 'jpeg', quality: 95 });
      if (i === 0) fs.writeFileSync(path.join(OUTDIR, 'brag.jpg'), buf);
      await enc.evaluate((b) => window.pushFrame(b), buf.toString('base64'));
      if (i % 60 === 0) console.log('frame', i, '/', N);
    }
    const EV = await comp.evaluate(() => window.AUDIO_EVENTS);
    const info = await enc.evaluate(([d, ev]) => window.finish(d, ev), [DUR, EV]);
    console.log(JSON.stringify(info));
    const parts = [];
    for (let o = 0; o < info.total; o += 4 << 20) parts.push(Buffer.from(await enc.evaluate(([o, n]) => window.slice(o, n), [o, 4 << 20]), 'base64'));
    fs.writeFileSync(path.join(OUTDIR, 'brag.mp4'), Buffer.concat(parts));
    console.log('wrote brag.mp4', info.total);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
