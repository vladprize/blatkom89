// Top-down thumbnails of every map for the map pickers, captured from the real renderer (the
// single-file demo build): the whole map at 1 texel per world px with the night lighting on, players
// hidden, scaled to `size` px wide at the map's own aspect ratio (no bands: the square tile centres the
// picture above its caption band, see .maptile in apps/web/src/ui/styles.css).
// Usage: npm run build:demo:single && node tools/map-thumbs.mjs [size=320] [--nolight] [--out dir] [mapId …]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const size = Number(argv.find((a) => /^\d+$/.test(a)) ?? 320);
const out = resolve(opt('--out', join(root, 'apps/web/public/assets/maps')));
const only = argv.filter((a) => /^[a-z]+$/.test(a) && a !== opt('--out', ''));
const file = join(root, 'apps/web/dist-demo/blatkom89-demo.html');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: 'en-GB' })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(pathToFileURL(file).href);
await page.waitForFunction(() => !!window.__blatkom?.app, null, { timeout: 60000 });
await page.evaluate(() => localStorage.setItem('blatkom89.tutorial.v1', '1'));
const maps = await page.evaluate(() => window.__blatkom.mapOrder ?? ['factory', 'stroyka', 'dk', 'gastronom', 'hospital', 'garages', 'yard']);
for (const mapId of only.length ? only : maps) {
  await page.evaluate((mapId) => window.__blatkom.app.startPractice({ mapId, bots: 1, difficulty: 'easy' }), mapId);
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  const m = await page.evaluate((nolight) => {
    const g = window.__blatkom.game;
    const sc = g.scene.getScene('game');
    sc.session.brains.length = 0;
    for (const p of sc.session.world.players.values()) {
      p.x = -500;
      p.y = -500;
      p.alive = false;
      p.respawnAt = 1e12;
    }
    if (nolight) sc.lighting.enabled = false;
    g.scene.getScene('hud').scene.setVisible(false);
    const w = sc.session.world.map;
    g.scale.setGameSize(w.width, w.height);
    sc.cameras.main.setZoom(1);
    sc.debugCam = { x: w.width / 2, y: w.height / 2 };
    return { w: w.width, h: w.height };
  }, flag('--nolight'));
  await page.waitForTimeout(900);
  const png = await page.locator('canvas').first().screenshot();
  // fit into a square on the page (browser canvas does the high-quality downscale and JPEG encoding)
  const jpg = await page.evaluate(
    async ({ b64, size, w, h }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = size;
      c.height = Math.round((size * h) / w);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0d0b0a';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // the night palette reads dark at thumbnail size: lift it a little
      ctx.filter = 'brightness(1.18) contrast(1.06) saturate(1.05)';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.84).split(',')[1];
    },
    { b64: png.toString('base64'), size, w: m.w, h: m.h },
  );
  const path = join(out, `${mapId}.jpg`);
  writeFileSync(path, Buffer.from(jpg, 'base64'));
  console.log('thumb', mapId, `${m.w}x${m.h}`, '→', path);
  await page.evaluate(() => window.__blatkom.app.goMenu());
}
await browser.close();
