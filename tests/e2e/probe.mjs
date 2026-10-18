// Prints FPS / game state after a delay. Usage: node tests/e2e/probe.mjs <url> [waitMs]
import { chromium } from 'playwright';
const [url, wait = '6000'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
console.log(await page.evaluate(() => {
  const g = window.__blatkom?.game;
  const scene = g?.scene.getScene('game');
  const s = scene?.session;
  return JSON.stringify({ fps: g?.loop.actualFps, renderer: g?.renderer.type, size: [g?.scale.gameSize.width, g?.scale.gameSize.height], phase: s?.phase?.(), time: s?.world?.time, hud: s?.hud?.() });
}));
await browser.close();
