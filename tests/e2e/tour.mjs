// Art-review tour: loads a practice match and screenshots fixed camera positions.
// Usage: node tests/e2e/tour.mjs <baseUrl> <map> <outPrefix> "x,y;x,y;..." [w] [h] [extraQuery]
import { chromium } from 'playwright';
const [base, map, out, spots, w = '1280', h = '720', extra = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })).newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => m.type() === 'error' && logs.push('[console] ' + m.text()));
const [x0, y0] = spots.split(';')[0].split(',');
await page.goto(`${base}/?play=offline&map=${map}&bots=3&cam=${x0},${y0}${extra}`);
await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 90000 });
let i = 0;
for (const spot of spots.split(';')) {
  const [x, y] = spot.split(',').map(Number);
  await page.evaluate(([cx, cy]) => {
    window.__blatkom.game.scene.getScene('game').debugCam = { x: cx, y: cy };
  }, [x, y]);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}_${i++}.png` });
}
console.log(logs.slice(0, 10).join('\n') || 'no errors');
await browser.close();
