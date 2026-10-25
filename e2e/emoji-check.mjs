import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
await p.setContent('<div id="e" style="font-size:64px;font-family:sans-serif">\u{1F642}\u{1F389}</div>');
await p.waitForTimeout(800);
const stats = await p.evaluate(() => {
  const el = document.getElementById('e');
  const c = document.createElement('canvas'); c.width = 200; c.height = 100;
  const x = c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,200,100);
  x.font = '64px sans-serif'; x.fillStyle='#000'; x.fillText(el.textContent, 5, 75);
  const d = x.getImageData(0,0,200,100).data; let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++;
  return { dark };
});
console.log('dark pixels for 2 emoji glyphs:', stats.dark, stats.dark > 400 ? 'RENDERED' : 'LIKELY TOFU');
await p.screenshot({ path: '/tmp/ui-shots/emoji-check.png', clip: { x: 0, y: 0, width: 220, height: 110 } });
await b.close();
