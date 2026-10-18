// Usage: node tests/e2e/shot.mjs <url> <out.png> [waitMs] [width] [height] [mobile]
import { chromium } from 'playwright';
const [url, out, wait = '6000', w = '1280', h = '720', mobile = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out });
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
