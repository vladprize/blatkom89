// Map review screenshots from the single-file demo build: the whole map at 1 texel per world px
// and gameplay-zoom views around the given points (bots frozen, HUD hidden).
// Usage: node tests/e2e/mapshot.mjs <path-to-blatkom89-demo.html> <outDir> <mapId> [x y x y …]
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [file, out, mapId, ...pts] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(pathToFileURL(resolve(file)).href);
await page.getByRole('textbox', { name: 'Alias' }).waitFor({ timeout: 60000 });
await page.getByRole('button', { name: 'Done' }).click();
await page.evaluate(() => localStorage.setItem('blatkom89.tutorial.v1', '1'));
await page.evaluate((mapId) => window.__blatkom.app.startPractice({ mapId, bots: 1, difficulty: 'easy' }), mapId);
await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
const setup = async (cx, cy, zoom, gw, gh) => {
  await page.evaluate(
    ({ cx, cy, zoom, gw, gh }) => {
      const g = window.__blatkom.game;
      const sc = g.scene.getScene('game');
      sc.session.brains.length = 0;
      for (const p of sc.session.world.players.values()) {
        p.x = 30;
        p.y = 30;
        p.alive = false;
        p.respawnAt = 1e12;
      }
      g.scene.getScene('hud').scene.setVisible(false);
      g.scale.setGameSize(gw, gh);
      const cam = sc.cameras.main;
      cam.setZoom(zoom);
      sc.debugCam = { x: cx, y: cy };
    },
    { cx, cy, zoom, gw, gh },
  );
  await page.waitForTimeout(700);
};
const m = await page.evaluate(() => {
  const w = window.__blatkom.game.scene.getScene('game').session.world;
  return { w: w.map.width, h: w.map.height };
});
await setup(m.w / 2, m.h / 2, 1, m.w, m.h);
const canvas = page.locator('canvas').first();
await canvas.screenshot({ path: `${out}/${mapId}_full.png` });
for (let i = 0; i + 1 < pts.length; i += 2) {
  const x = Number(pts[i]);
  const y = Number(pts[i + 1]);
  await setup(x, y, 2, 1200, 800);
  await canvas.screenshot({ path: `${out}/${mapId}_${x}_${y}.png` });
}
await browser.close();
