const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const dir = path.join(__dirname, 'stills'); const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort((a,b)=>parseFloat(a.slice(1))-parseFloat(b.slice(1)));
  const sel = process.argv[2] ? files.filter(f => process.argv[2].split(',').some(x => f.startsWith('t'+Number(x).toFixed(2)))) : files;
  const html = `<body style="margin:0;background:#333;display:grid;grid-template-columns:repeat(2,960px);gap:4px;font:20px sans-serif;color:#fff">` + sel.map(f => `<div style="position:relative"><img src="file:///${path.join(dir,f).split(path.sep).join('/')}" style="width:960px;display:block"><span style="position:absolute;left:6px;top:4px;background:#000a;padding:2px 6px">${f}</span></div>`).join('') + '</body>';
  fs.writeFileSync(path.join(__dirname, 'sheet.html'), html);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1924, height: 600 } });
  await p.goto('file:///' + path.join(__dirname, 'sheet.html').split(path.sep).join('/')); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, process.argv[3] || 'sheet.jpg'), fullPage: true, type: 'jpeg', quality: 80 }); await b.close();
})();
