// UI screenshots: clicks through buttons by accessible name and captures each screen.
// Usage: node tests/e2e/ui-tour.mjs <url> <outPrefix> "Button A|Button B|..." [w] [h] [mobile]
import { chromium } from 'playwright';
const [url, out, seq, w = '1280', h = '720', mobile = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, isMobile: !!mobile, hasTouch: !!mobile });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(6000);
let i = 0;
for (const name of seq.split('|').filter(Boolean)) {
  await page.getByRole('button', { name: new RegExp(name) }).first().click({ timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}_${i++}.png` });
}
console.log(errors.join('\n') || 'no page errors');
await browser.close();
