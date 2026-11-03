// The loading-screen pictures of the maps that have no illustration of their own (v0.2.18: «Черкизон»,
// «Воркута» — the owner's layouts carry portraits, brand logos and camp elements, so the picture is the
// map itself): captured from the real renderer of the single-file demo build at 1600×900 with the night
// lighting (and the snow) on, players hidden; written as assets/scenes/<id>.jpg and scenes/thumbs/<id>.jpg
// (640×360). Usage: npm run build:demo:single && node tools/map-scenes.mjs [mapId …]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/public/assets/scenes');
const file = join(root, 'apps/web/dist-demo/blatkom89-demo.html');
// where the camera looks (world px) and how close: the whole width of the map, the top part of it
const VIEWS = {
  cherkizon: { x: 750, y: 430, zoom: 1600 / 1500 },
  vorkuta: { x: 750, y: 430, zoom: 1600 / 1500 },
};
const ids = process.argv.slice(2).filter((a) => VIEWS[a]);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'en-GB' })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => !!window.__blatkom?.app, null, { timeout: 60000 });
await page.evaluate(() => localStorage.setItem('blatkom89.tutorial.v1', '1'));
for (const mapId of ids.length ? ids : Object.keys(VIEWS)) {
  const v = VIEWS[mapId];
  await page.evaluate((mapId) => window.__blatkom.app.startPractice({ mapId, bots: 1, difficulty: 'easy' }), mapId);
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  await page.evaluate((v) => {
    const g = window.__blatkom.game;
    const sc = g.scene.getScene('game');
    sc.session.brains.length = 0;
    for (const p of sc.session.world.players.values()) {
      p.x = -500;
      p.y = -500;
      p.alive = false;
      p.respawnAt = 1e12;
    }
    g.scene.getScene('hud').scene.setVisible(false);
    // nothing of the page over the canvas (the full-screen button…)
    if (!document.getElementById('shot-css')) {
      const st = document.createElement('style');
      st.id = 'shot-css';
      st.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
      document.head.append(st);
    }
    g.scale.setGameSize(1600, 900);
    sc.cameras.main.setZoom(v.zoom);
    sc.debugCam = { x: v.x, y: v.y };
  }, v);
  await page.waitForTimeout(1500);
  const png = await page.locator('canvas').first().screenshot();
  for (const [w, h, dir, q] of [
    [1600, 900, out, 0.82],
    [640, 360, join(out, 'thumbs'), 0.78],
  ]) {
    const jpg = await page.evaluate(
      async ({ b64, w, h, q }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = 'brightness(1.08) contrast(1.05)';
        ctx.drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', q).split(',')[1];
      },
      { b64: png.toString('base64'), w, h, q },
    );
    writeFileSync(join(dir, `${mapId}.jpg`), Buffer.from(jpg, 'base64'));
  }
  console.log('scene', mapId, '→', join(out, `${mapId}.jpg`));
  await page.evaluate(() => window.__blatkom.app.goMenu());
}
await browser.close();
