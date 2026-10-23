// The Mac app (tools/build-mac-app.py, v0.2.14) checked on Linux: its Resources/app folder run by Linux
// Electron of the same version under Xvfb — the window on app://blatkom/index.html, the menu soundtrack,
// the prologue over the 2089 hall from inside the app with the soundtrack quiet, mission 1 played and
// paid, then a second launch with the same data folder: the alias, the experience and the story's
// progress still there, no prologue again, no warning. No page errors. (macOS itself is not available
// here: the bundle's own Electron is the same version for darwin.)
//
// Usage: xvfb-run -a node tests/e2e/mac-app.mjs <linux electron binary> <the app's Resources/app> <outDir> <scratch data dir>
import { _electron as electron } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
const [exe, appDir, out, userData] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
rmSync(userData, { recursive: true, force: true });
const checks = [];
const check = (ok, what) => { checks.push({ ok: !!ok, what }); console.log(ok ? '✔' : '✖', what); };
const launch = () => electron.launch({ executablePath: exe, args: [appDir, `--user-data-dir=${userData}`, '--no-sandbox', '--lang=ru-RU'], env: { ...process.env, LANG: 'ru_RU.UTF-8' } });
let app = await launch();
let win = await app.firstWindow();
const problems = [];
win.on('pageerror', (e) => problems.push(e.message));
win.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
await win.waitForLoadState('domcontentloaded');
check(win.url() === 'app://blatkom/index.html', `the window loads app://blatkom/index.html (${win.url()})`);
await win.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]'); }, null, { timeout: 120000 });
if (await win.getByTestId('boot-play').count()) await win.getByTestId('boot-play').click();
const nick = win.getByRole('textbox', { name: /Кличка|Alias/ });
await nick.waitFor({ timeout: 60000 });
await nick.fill('Pilot');
await win.getByRole('button', { name: /Готово|Done/ }).click();
await win.getByTestId('menu-story').waitFor({ timeout: 30000 });
const menuMusic = await win.evaluate(() => window.__blatkom.music.state());
check(menuMusic.wanted && menuMusic.playing, `the menu soundtrack plays (${JSON.stringify(menuMusic)})`);
await win.getByTestId('menu-story').click();
await win.getByTestId('comic-scene').waitFor({ timeout: 20000 });
await win.waitForFunction(() => (document.querySelector('[data-testid=comic-scene]')?.naturalWidth ?? 0) > 0, null, { timeout: 20000 });
const pro = await win.evaluate(() => ({ scene: document.querySelector('[data-testid=comic-scene]').getAttribute('data-scene'), src: document.querySelector('[data-testid=comic-scene]').getAttribute('src').slice(0, 40), music: window.__blatkom.music.state() }));
check(pro.scene === 'hall2089' && pro.src.startsWith('app://blatkom/assets/scenes/hall2089.jpg') && pro.music.quiet && pro.music.playing, `the prologue over the 2089 hall from inside the app, the soundtrack quiet (${JSON.stringify(pro)})`);
await win.screenshot({ path: `${out}/electron_prologue.png` });
await win.getByTestId('comic-skip').click();
await win.getByTestId('story').waitFor({ timeout: 20000 });
await win.getByTestId('story-play-a1').click();
await win.getByTestId('comic-skip').click();
await win.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
for (let k = 0; k < 8; k++) {
  const done = await win.evaluate(() => { const s = window.__blatkom.app.session; if (!s?.world) return true; if (s.outcome()) return true; const w = s.world; const hero = w.players.get('local'); hero.invulnUntil = 1e12; for (const e of [...w.players.values()].filter((p) => p.team === 1 && p.alive)) { e.invulnUntil = 0; w.applyDamage(e, hero, 999, 'pistol'); } return !!s.outcome(); });
  if (done) break;
  await win.waitForTimeout(2200);
}
await win.getByTestId('comic').waitFor({ timeout: 20000 });
await win.getByTestId('comic-skip').click();
await win.getByTestId('story-rewards').waitFor({ timeout: 20000 });
check((await win.getByTestId('story-rewards').innerText()).trim() === '+40 XP', 'mission 1 done: +40 XP');
await win.screenshot({ path: `${out}/electron_win.png` });
await app.close();
// a second launch: the alias, the experience and the story's progress are still there
app = await launch();
win = await app.firstWindow();
win.on('pageerror', (e) => problems.push(e.message));
await win.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]'); }, null, { timeout: 120000 });
if (await win.getByTestId('boot-play').count()) await win.getByTestId('boot-play').click();
await win.getByTestId('menu-story').waitFor({ timeout: 30000 });
const again = await win.evaluate(() => ({ nick: window.__blatkom.app.localProfile?.displayName, xp: window.__blatkom.app.localProfile?.xp, dialog: !!document.querySelector('[role=dialog]') }));
await win.getByTestId('menu-story').click();
await win.getByTestId('story').waitFor({ timeout: 20000 });
await win.waitForTimeout(600);
const hub = await win.evaluate(() => ({ a1: document.querySelector('[data-testid=story-mission-a1]')?.getAttribute('data-state'), a2: document.querySelector('[data-testid=story-mission-a2]')?.getAttribute('data-state'), warn: !!document.querySelector('[data-testid=story-unsaved]'), comic: !!document.querySelector('[data-testid=comic]') }));
check(again.nick === 'Pilot' && again.xp === 40 && !again.dialog && hub.a1 === 'done' && hub.a2 === 'open' && !hub.warn && !hub.comic, `the next launch keeps it all (${JSON.stringify({ ...again, ...hub })})`);
await win.screenshot({ path: `${out}/electron_relaunch_hub.png` });
await app.close();
check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `[electron] ${bad.length} of ${checks.length} checks failed` : `[electron] all ${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
