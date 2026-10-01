const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const srv = http.createServer((q, s) => { const p = path.join(__dirname, q.url.slice(1)); if (!fs.existsSync(p)) { s.writeHead(404); return s.end(); } const st = fs.statSync(p); s.writeHead(200, { 'Content-Type': p.endsWith('mp4') ? 'video/mp4' : 'text/html', 'Content-Length': st.size, 'Accept-Ranges': 'none' }); fs.createReadStream(p).pipe(s); });
srv.listen(4591, async () => {
  const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('http://localhost:4591/encoder.html');
  const r = await p.evaluate(async () => {
    const v = document.createElement('video'); v.src = '/check.mp4'; v.muted = true; v.style = 'position:fixed;inset:0;width:1920px;height:1080px'; document.body.appendChild(v);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(v.error && v.error.message); });
    const seek = (t) => new Promise((res) => { v.onseeked = res; v.currentTime = t; });
    await seek(12.0);
    return { dur: v.duration, w: v.videoWidth, h: v.videoHeight, audio: v.mozHasAudio ?? (v.webkitAudioDecodedByteCount !== undefined), err: null };
  });
  await p.screenshot({ path: path.join(__dirname, 'verify12.jpg'), type: 'jpeg', quality: 60 });
  // play a stretch to confirm audio decodes
  const a = await p.evaluate(async () => { const v = document.querySelector('video'); v.currentTime = 3; await v.play(); await new Promise(r => setTimeout(r, 1500)); v.pause(); return { audioBytes: v.webkitAudioDecodedByteCount, videoBytes: v.webkitVideoDecodedByteCount, t: v.currentTime }; });
  console.log(JSON.stringify(r), JSON.stringify(a)); await b.close(); srv.close();
});
