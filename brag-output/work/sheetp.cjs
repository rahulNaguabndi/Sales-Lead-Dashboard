const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => { const dir = path.join(__dirname, process.argv[2]); const files = process.argv[3].split(',');
  const html = `<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(2,960px);gap:4px;font:20px sans-serif;color:#fff">` + files.map(f => `<div style="position:relative"><img src="${f}.png" style="width:960px;display:block"><span style="position:absolute;left:6px;top:4px;background:#000c;padding:2px 6px">${f}</span></div>`).join('') + '</body>';
  fs.writeFileSync(path.join(dir, 'sheet.html'), html);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1924, height: 600 } });
  await p.goto('file:///' + path.join(dir, 'sheet.html').split(path.sep).join('/')); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, process.argv[4]), fullPage: true, type: 'jpeg', quality: 80 }); await b.close(); })();
