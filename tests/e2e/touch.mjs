// Touch-control test on an emulated phone (landscape): the left stick moves the player, the right
// stick aims, the fire button shoots (ammo drops). Uses raw CDP touch events (multi-touch drags).
// Usage: node tests/e2e/touch.mjs <baseUrl> [outPng]
import { chromium } from 'playwright';

const [base, outPng] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?play=offline&map=factory&bots=1&diff=easy`);
await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 90000 });
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
const me = () => page.evaluate(() => {
  const s = window.__blatkom.game.scene.getScene('game').session;
  const p = s.players().find((q) => q.isLocal);
  return { x: p.x, y: p.y, aim: p.aim, alive: p.alive, mag: s.hud().mag };
});
const sleep = (ms) => page.waitForTimeout(ms);

const result = {};
// 1) left stick: press in the lower-left zone and drag right/up for ~1.5 s
const start = await me();
await touch('touchStart', [[150, 300, 1]]);
for (let i = 1; i <= 15; i++) {
  await touch('touchMove', [[150 + Math.min(60, i * 8), 300 - Math.min(20, i * 3), 1]]);
  await sleep(100);
}
const moved = await me();
await touch('touchEnd', []);
result.moveDistance = +Math.hypot(moved.x - start.x, moved.y - start.y).toFixed(1);
result.movedRight = moved.x > start.x;

// 2) right stick: drag in the lower-right zone pointing up (aim ≈ -90°) — aims and (with auto-fire) shoots
await sleep(300);
const before = await me();
await touch('touchStart', [[700, 300, 2]]);
for (let i = 1; i <= 10; i++) {
  await touch('touchMove', [[700, 300 - i * 6, 2]]);
  await sleep(100);
}
const aimed = await me();
await touch('touchEnd', []);
result.aimDeg = +((aimed.aim * 180) / Math.PI).toFixed(0);
result.aimUp = Math.abs(((aimed.aim * 180) / Math.PI) + 90) < 30;
result.magBefore = before.mag;
result.magAfter = aimed.mag;

// 3) both sticks at once (multi-touch): move left while aiming right
await touch('touchStart', [[150, 300, 3], [700, 300, 4]]);
for (let i = 1; i <= 8; i++) {
  await touch('touchMove', [[150 - Math.min(50, i * 8), 300, 3], [700 + Math.min(40, i * 6), 300, 4]]);
  await sleep(100);
}
const multi = await me();
await touch('touchEnd', []);
result.multiTouchAimDeg = +((multi.aim * 180) / Math.PI).toFixed(0);
if (outPng) await page.screenshot({ path: outPng });
result.errors = errors;
console.log(JSON.stringify(result));
await browser.close();
const ok = result.moveDistance > 20 && result.movedRight && result.aimUp && errors.length === 0;
process.exit(ok ? 0 : 1);
