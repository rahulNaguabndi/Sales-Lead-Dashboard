const { chromium } = require('playwright');
(async () => {
  for (const channel of [undefined, 'chrome']) {
    const b = await chromium.launch({ channel });
    const p = await b.newPage();
    await p.goto('http://localhost:3001/');
    const r = await p.evaluate(async () => {
      const v = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 12e6, framerate: 30 });
      let a = null; try { a = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }); } catch (e) { a = String(e); }
      return { v: v.supported, a: a && a.supported };
    });
    console.log(channel || 'bundled', JSON.stringify(r));
    await b.close();
  }
})();
