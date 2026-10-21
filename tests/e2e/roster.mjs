// The v0.23 roster end-to-end: the character screen lists all 24 characters with their portraits, every
// one of the ten new characters has its personal file (the owner's art, name and price) and is locked for a
// new player, «Try in practice» starts a match as that character, and all ten sprite atlases are loaded.
//
// Usage: node tests/e2e/roster.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/roster.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const NEW = [
  ['golub', 'Sizy', 'talons'],
  ['tarakan', 'Prusak', 'talons'],
  ['krysa', 'Sery', 'talons'],
  ['svinya', 'Borka', 'talons'],
  ['buyvol', 'Bugai', 'talons'],
  ['koshka', 'Murka', 'talons'],
  ['lisa', 'Alisa', 'talons'],
  ['nosorog', 'Rogov', 'talons'],
  ['gorilla', 'Samson', 'talons'],
  ['lev', 'Arkadich', 'talons'],
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('blatkom89.lang.v1', 'en');
    localStorage.setItem('blatkom89.tutorial.v1', '1');
    localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
  } catch {}
});
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[console] ${m.text()}`);
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
const imagesLoaded = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].every((i) => i.complete && i.naturalWidth > 0), sel);

try {
  await page.goto(base + '/');
  await pressPlay();
  const nick = page.getByRole('textbox', { name: 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`Casting ${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: 'Change character' }).click();
  await page.locator('.chars button').first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.chars button img')].every((i) => i.complete), null, { timeout: 15000 });
  const tiles = await page.locator('.chars button').count();
  check(tiles === 24, `the character screen lists ${tiles} characters`);
  check(await imagesLoaded('.chars button img'), 'every portrait is loaded');
  await page.screenshot({ path: `${outDir}/roster_characters.png` });

  let files = 0;
  for (const [id, name, currency] of NEW) {
    await page.locator('.chars button', { hasText: name }).click();
    await page.waitForFunction((n) => document.querySelector('.dossier .h1')?.textContent?.includes(n), name, { timeout: 5000 });
    await page.waitForFunction(() => {
      const i = document.querySelector('.dossier__img');
      return !!i && i.complete && i.naturalWidth > 0;
    }, null, { timeout: 10000 });
    const text = await page.locator('.dossier').innerText();
    const locked = await page.locator('.chars button[aria-pressed="true"].locked').count();
    const ok = locked === 1 && new RegExp(currency, 'i').test(text) && /Personal File/i.test(text);
    if (ok) files++;
    else console.log(`  ${id}: locked ${locked}, file: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  check(files === NEW.length, `the ten new characters have personal files with the art, locked, priced in talons (v0.24: all of them) (${files}/10)`);
  await page.screenshot({ path: `${outDir}/roster_dossier.png` });

  // try the last one (Arkadich) in practice
  await page.getByRole('button', { name: 'Try in practice' }).click();
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const game = await page.evaluate((ids) => {
    const g = window.__blatkom.game;
    const s = g.scene.getScene('game');
    const me = s.session.players().find((p) => p.isLocal);
    const v = s.views.get(me.slot);
    return { character: me.character, torso: v?.torso.texture.key, atlases: ids.filter((id) => g.textures.exists(`char_${id}`) && g.textures.get(`char_${id}`).getFrameNames().length > 50) };
  }, NEW.map((n) => n[0]));
  check(game.character === 'lev' && game.torso === 'char_lev', `«Try in practice» plays as Arkadich (${game.character}, ${game.torso})`);
  check(game.atlases.length === NEW.length, `all ten sprite atlases are loaded (${game.atlases.length})`);
  await page.screenshot({ path: `${outDir}/roster_practice.png` });
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: `${outDir}/roster_fail.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[roster] ${failed} problem(s)` : `[roster] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
