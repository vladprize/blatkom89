// The v0.23 maps end-to-end (in Russian): the practice map picker lists all ten maps with their pictures,
// the three new ones under their Russian names; then «Кладбище», «Красная площадь» and «Пионерлагерь» each
// load into a practice match with bots — each behind its loading screen (the owner's art, gone once the
// match is on) — every prop frame and the new wall and floor textures present,
// nothing drawn with a missing frame, no errors, the bots move about — and a screenshot of each is saved.
//
// Usage: node tests/e2e/maps.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/maps.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const NEW = [
  ['cemetery', 'Кладбище'],
  ['square', 'Красная площадь'],
  ['camp', 'Пионерлагерь'],
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('blatkom89.lang.v1', 'ru');
    localStorage.setItem('blatkom89.tutorial.v1', '1');
    localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
  } catch {}
});
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  const text = m.text();
  if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(text)) problems.push(`[console] ${text}`);
  // Phaser warns about frames and textures it cannot find
  if (m.type() === 'warning' && /not found|missing/i.test(text)) problems.push(`[warning] ${text}`);
});
async function pressPlay() {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  const play = page.getByTestId('boot-play');
  if (await play.count()) await play.click();
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('boot--hidden'), null, { timeout: 10000 });
}
const active = (id) =>
  page.waitForFunction((id) => {
    const s = window.__blatkom?.game?.scene.getScene('game')?.session;
    return s?.phase?.() === 'active' && s.world?.map?.id === id;
  }, id, { timeout: 45000 });

try {
  await page.goto(base + '/');
  await pressPlay();
  const nick = page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`Kartograf ${Math.random().toString(36).slice(2, 5)}`);
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });

  // the practice screen: ten map tiles, every picture loaded, the new ones under their Russian names
  await page.getByRole('button', { name: /Тренировка/ }).first().click();
  await page.locator('.maps .maptile').first().waitFor({ timeout: 15000 });
  const tiles = page.locator('.maps .maptile');
  const n = await tiles.count();
  for (let i = 0; i < n; i++) await tiles.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('.maps .maptile img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
  const picker = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('.maps .maptile')].map((t) => t.dataset.map),
    names: Object.fromEntries([...document.querySelectorAll('.maps .maptile')].map((t) => [t.dataset.map, t.textContent.trim()])),
    loaded: [...document.querySelectorAll('.maps .maptile img')].filter((i) => i.complete && i.naturalWidth > 0).map((i) => i.closest('.maptile').dataset.map),
  }));
  check(n === 10, `the practice map picker lists ${n} maps`);
  check(picker.loaded.length === n, `every map picture is loaded (${picker.loaded.length}/${n})`);
  const named = NEW.filter(([id, ru]) => picker.names[id]?.toLowerCase() === ru.toLowerCase());
  check(named.length === NEW.length, `the new maps are listed in Russian: ${NEW.map(([id]) => picker.names[id]).join(', ')}`);
  // pick the camp and read its blurb
  await page.locator('.maps .maptile[data-map=camp]').click();
  const blurb = await page.locator('.maps__blurb').innerText();
  check(/Пионерлагерь/.test(blurb) && /Звёздочк/.test(blurb) && /причал/.test(blurb), `the camp's blurb: «${blurb}»`);
  await page.screenshot({ path: `${outDir}/maps_picker.png` });

  // each new map in a practice match against bots
  // the camp was picked on the practice screen and starts with the button; the other two through the app
  let first = true;
  for (const [id, ru] of [NEW[2], NEW[0], NEW[1]]) {
    if (!first) {
      await page.evaluate((mapId) => window.__blatkom.app.startPractice({ mapId, bots: 3, difficulty: 'normal' }), id);
    } else {
      await page.getByTestId('practice-start').click();
      first = false;
    }
    // the map's loading screen over the countdown (the owner's art; every map has one)
    const art = true;
    const load = await page
      .getByTestId('loadscreen')
      .waitFor({ timeout: 4000 })
      .then(async () => ({ shown: true, name: await page.getByTestId('loadscreen-name').innerText(), scene: await page.getByTestId('loadscreen').getAttribute('data-scene') }))
      .catch(() => ({ shown: false }));
    check(art ? load.shown && load.scene === id && load.name.toUpperCase() === ru.toUpperCase() : !load.shown, `«${ru}»: ${art ? `the loading screen with its picture and name (${JSON.stringify(load)})` : 'no picture yet — no loading screen'}`);
    await active(id);
    await page.waitForTimeout(2500);
    check((await page.getByTestId('loadscreen').count()) === 0, `«${ru}»: the loading screen is gone once the match is on`);
    const before = await page.evaluate(() => [...window.__blatkom.game.scene.getScene('game').session.players()].filter((p) => !p.isLocal).map((p) => [p.x, p.y]));
    await page.waitForTimeout(2500);
    const r = await page.evaluate((ru) => {
      const g = window.__blatkom.game;
      const sc = g.scene.getScene('game');
      const imgs = sc.children.list.filter((o) => o.type === 'Image' || o.type === 'TileSprite');
      const missing = imgs.filter((o) => o.frame?.name === '__MISSING' || o.texture?.key === '__MISSING').length;
      const props = imgs.filter((o) => o.texture?.key === 'props' && String(o.frame?.name).startsWith('prop_')).length;
      const tex = ['wall_fence_iron', 'wall_water', 'wall_kremlin', 'wall_granite', 'wall_roof_church', 'floor_cobble'].filter((k) => !g.textures.exists(k));
      const texts = [];
      const walk = (o) => {
        if (o.type === 'Text') texts.push(String(o.text));
        if (o.list) o.list.forEach(walk);
      };
      g.scene.getScene('hud').children.list.forEach(walk);
      const label = texts.some((t) => t.toUpperCase().includes(ru.toUpperCase()));
      return { map: sc.session.world.map.id, missing, props, tex, label, others: sc.session.players().filter((p) => !p.isLocal).map((p) => [p.x, p.y]) };
    }, ru);
    const moved = r.others.filter((p, i) => before[i] && Math.hypot(p[0] - before[i][0], p[1] - before[i][1]) > 4).length;
    check(r.map === id && r.missing === 0 && r.props > 60 && r.tex.length === 0, `«${ru}»: ${r.props} props drawn, ${r.missing} missing frames, textures ${r.tex.length ? 'missing ' + r.tex.join(', ') : 'all present'}`);
    check(r.label, `«${ru}»: the minimap shows the Russian map name`);
    check(moved > 0, `«${ru}»: the bots move about (${moved}/${r.others.length})`);
    await page.screenshot({ path: `${outDir}/maps_${id}.png` });
  }
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: `${outDir}/maps_fail.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[maps] ${failed} problem(s)` : `[maps] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
