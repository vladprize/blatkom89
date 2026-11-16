// The trial build (Fable cut, docs/FABLE_CUT.md): its moments one by one, in a practice match of the demo build.
//
//   node apps/web/build.mjs --mode=demo && (cd apps/web/dist-demo && python3 -m http.server 8130) &
//   node tests/e2e/fable.mjs http://127.0.0.1:8130 test-results/fable/shot [map]
//
// The opening pan on the countdown, the recoil spring, a run of three kills (the camera's punch, «ДВОЙНОЕ!» and
// «ТРОЙНОЕ!», blood on the wall behind), low health, F2 to the classic picture and back (the classic one must be
// the main version's: its own light map, the tape pass, no echo, no bed), the match's end. `?fablelock` pins the
// quality: a software renderer would otherwise start on «fast» and step down. Not part of run-e2e.mjs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const [base, out, map = 'factory'] = process.argv.slice(2);
const W = 1280, H = 720;
mkdirSync(dirname(out), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'ru-RU' });
await ctx.addInitScript(() => { try { for (const [k, v] of Object.entries({ 'blatkom89.lang.v1': 'ru', 'blatkom89.welcome.v1': String(Date.now()), 'blatkom89.story.prologue.v1': '1', 'blatkom89.matches-done.v1': '3', 'blatkom89.hints.v1': '9', 'blatkom89.tutorial.v1': '1', 'blatkom89.settings.v1': JSON.stringify({ look: 'fable', fableTier: 2, vhs: 1 }) })) localStorage.setItem(k, v); } catch {} });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|Failed to load resource|GPU stall|willReadFrequently/.test(m.text()) && logs.push(`[${m.type()}] ` + m.text()));
const results = [];
const check = (ok, text) => { results.push(`${ok ? '✔' : '✖'} ${text}`); };
await page.goto(base + '/?fablelock');
await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
const nick = page.locator('.modal input.input').first();
if (await nick.waitFor({ timeout: 8000 }).then(() => true, () => false)) { await nick.fill('fable'); await page.locator('.modal .btn--red').last().click(); }
await page.waitForTimeout(400);
await page.mouse.click(W / 2, H / 2);
await page.evaluate((m) => window.__blatkom.app.startPractice({ mapId: m, bots: 5, difficulty: 'easy', gameMode: 'ffa' }), map);
const S = () => page.evaluate(() => { const g = window.__blatkom.game; const sc = g.scene.getScene('game'); if (!sc?.session) return null; const me = sc.session.players().find((p) => p.isLocal); const f = sc.fable; return { phase: sc.session.phase(), cam: { x: Math.round(sc.camX), y: Math.round(sc.camY) }, me: me ? { x: Math.round(me.x), y: Math.round(me.y), hp: me.hp, alive: me.alive } : null, on: f?.on, tier: f?.tier, intro: !!f?.intro, introDone: f?.introDone, punch: f?.punch, streak: f?.streak, fade: f?.fade, zoom: sc.cameras.main.zoom, pipe: f?.pipeline ? { lowHp: +f.pipeline.lowHp.toFixed(2), kick: +f.pipeline.kick.toFixed(2), fade: +f.pipeline.fade.toFixed(2), bloom: f.pipeline.bloomPasses } : null, kickCam: { x: +f.cam.x.toFixed(2), y: +f.cam.y.toFixed(2) }, voices: window.__blatkom.sfx.voices, bed: !!window.__blatkom.sfx.bed }; });
// ── the opening ──
await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'countdown', null, { timeout: 90000 });
await page.waitForTimeout(350);
const a = await S();
await page.screenshot({ path: `${out}_intro_a.png` });
await page.waitForTimeout(900);
const b = await S();
await page.screenshot({ path: `${out}_intro_b.png` });
await page.waitForFunction(() => window.__blatkom.game.scene.getScene('game').session.phase() === 'active', null, { timeout: 30000 });
await page.waitForTimeout(500);
const c = await S();
const dist = (s) => Math.hypot(s.cam.x - s.me.x, s.cam.y - s.me.y);
check(a.intro && dist(a) > 75, `the opening starts away from the player (${Math.round(dist(a))} px, ${JSON.stringify(a.cam)} vs ${JSON.stringify(a.me)})`);
check(dist(b) < dist(a), `…and glides in (${Math.round(dist(b))} px a second later)`);
check(c.introDone && dist(c) < 75, `by «go» the camera is the player's (${Math.round(dist(c))} px with the aim's look-ahead)`);
check(c.on && c.tier === 2 && c.pipe?.bloom === 3, `the Fable cut is on, cinema tier (${JSON.stringify({ on: c.on, tier: c.tier, pipe: c.pipe })})`);
check(c.bed, 'the bed under the fight is playing');
await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' });
// freeze the bots where they are so the staged moments are the same every run
await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); sc.session.brains.length = 0; });
// ── recoil ──
await page.mouse.move(W * 0.75, H * 0.5);
await page.waitForTimeout(300);
await page.mouse.down();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}_fire.png` });
await page.mouse.up();
await page.waitForTimeout(500);
// the spring itself, stepped at 60 frames a second (this machine draws a few frames a second: a kick is over within one)
const spring = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const f = sc.fable; const players = sc.session.players(); const me = players.find((p) => p.isLocal); f.cam.x = f.cam.y = f.kvx = f.kvy = 0; f.recoil(0, 0.5); let max = 0, at = 0; const curve = []; for (let i = 1; i <= 60; i++) { f.update(sc.time.now, 1000 / 60, players, me, new Set(), false); const d = Math.hypot(f.cam.x, f.cam.y); if (d > max) { max = d; at = i; } if (i % 6 === 0) curve.push(+f.cam.x.toFixed(2)); } return { max: +max.toFixed(2), atFrame: at, end: +Math.hypot(f.cam.x, f.cam.y).toFixed(3), curve }; });
check(spring.max > 1.5 && spring.max <= 11.01 && spring.atFrame >= 2 && spring.atFrame <= 8, `a shot kicks the camera back along the barrel: ${spring.max} px at frame ${spring.atFrame} of 60 a second (${spring.curve.join(', ')})`);
check(spring.end < 0.05, `…and it is back at rest within a second (${spring.end} px)`);
// ── a kill, then a run of them: the session's own «kill» events, three in a row, a wall behind the victim ──
const run = await page.evaluate(async () => {
  const sc = window.__blatkom.game.scene.getScene('game');
  const f = sc.fable;
  const w = sc.session.world;
  const me = w.players.get('local');
  const col = w.collision;
  // a spot a little way off with a wall some 40 px behind it
  let best = null;
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const hit = col.raycast(me.x, me.y, Math.cos(a), Math.sin(a), 400, 'shot'); const t = hit ? hit.t : 400; if (t > 70 && (!best || t < best.t)) best = { a, t }; }
  if (!best) return null;
  const decalsBefore = sc.children.list.filter((o) => o.type === 'Image' && o.depth === 20.4).length;
  const seen = { punch: 0, streak: 0, banners: [] };
  const hud = window.__blatkom.game.scene.getScene('hud');
  const orig = hud.showBanner.bind(hud);
  hud.showBanner = (title, ...rest) => { seen.banners.push(title); return orig(title, ...rest); };
  for (let n = 0; n < 3; n++) {
    const bot = w.players.get('bot' + n);
    const d = Math.max(40, best.t - 30);
    bot.x = me.x + Math.cos(best.a) * d;
    bot.y = me.y + Math.sin(best.a) * d;
    await new Promise((r) => setTimeout(r, 350));
    const players = sc.session.players();
    sc.handleEvent({ t: 'kill', victim: bot.slot, killer: me.slot, weapon: me.weapon, assists: [] }, players, sc.time.now);
    seen.punch = Math.max(seen.punch, f.punch);
    seen.streak = Math.max(seen.streak, f.streak);
    await new Promise((r) => setTimeout(r, 250));
  }
  hud.showBanner = orig;
  const decalsAfter = sc.children.list.filter((o) => o.type === 'Image' && o.depth === 20.4).length;
  return { ...seen, wallBlood: decalsAfter - decalsBefore, wall: Math.round(best.t) };
});
await page.screenshot({ path: `${out}_streak.png` });
check(run && run.punch === 1 && run.streak === 3, `three kills in a row: each punches the camera, the run is counted (${JSON.stringify(run)})`);
check(run && run.banners.length === 2, `…and called out twice (${run?.banners.join(', ')})`);
check(run && run.wallBlood >= 1, `blood on the wall behind (${run?.wallBlood} splashes on a wall ${run?.wall} px away)`);
const punch = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const f = sc.fable; const players = sc.session.players(); const me = players.find((p) => p.isLocal); f.punch = 1; let zmax = 0; for (let i = 1; i <= 30; i++) { f.update(sc.time.now, 1000 / 60, players, me, new Set(), false); zmax = Math.max(zmax, sc.cameras.main.zoom); } return { zmax: +zmax.toFixed(4), zend: sc.cameras.main.zoom, kick: f.pipeline?.kick }; });
check(punch.zmax > 2.02 && punch.zmax < 2.07 && punch.zend === 2, `a kill punches the camera in and lets go: zoom ${punch.zmax} at most, ${punch.zend} half a second later`);
await page.waitForTimeout(900);
const after = await S();
check(Math.abs(after.zoom - 2) < 1e-6, `the zoom is back at exactly 2 (${after.zoom})`);
// ── low health ──
await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); sc.session.world.players.get('local').hp = 14; });
let low = 0;
for (let i = 0; i < 16; i++) { await page.waitForTimeout(90); const s = await S(); low = Math.max(low, s.pipe?.lowHp ?? 0); }
await page.screenshot({ path: `${out}_lowhp.png` });
check(low > 0.3, `at 14 health the picture drains and beats (${low})`);
await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); sc.session.world.players.get('local').hp = 100; });
await page.waitForTimeout(500);
check(((await S()).pipe?.lowHp ?? 1) === 0, 'healed: the picture is clean again');
// ── F2: the classic picture and back ──
await page.keyboard.press('F2');
await page.waitForTimeout(700);
const cl = await S();
const clState = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const pp = sc.cameras.main.postPipelines; return { v2: !!sc.lighting.shadows, vhs: !!sc.vhs, posts: pp.length === 1 && pp[0] === sc.vhs ? 'Vhs' : `other(${pp.length})`, fableSound: !!window.__blatkom.sfx.fable, bed: !!window.__blatkom.sfx.bed }; });
await page.screenshot({ path: `${out}_classic.png` });
check(!cl.on && !clState.v2 && clState.vhs && clState.posts === 'Vhs' && !clState.fableSound && !clState.bed, `F2: the classic picture and sound — its own light map, the tape pass, no echo, no bed (${JSON.stringify(clState)})`);
await page.keyboard.press('F2');
await page.waitForTimeout(900);
const fb = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const pp = sc.cameras.main.postPipelines; return { on: sc.fable.on, v2: !!sc.lighting.shadows, posts: pp.length === 1 && pp[0] === sc.fable.pipeline ? 'Fable' : `other(${pp.length})`, bakeMs: Math.round(sc.lighting.shadows?.bakeMs ?? -1), fableSound: !!window.__blatkom.sfx.fable }; });
check(fb.on && fb.v2 && fb.posts === 'Fable' && fb.fableSound, `F2 again: the Fable cut is back (${JSON.stringify(fb)})`);
// ── the end ──
await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const w = sc.session.world; w.matchEndsAt = w.time + 300; });
await page.waitForFunction(() => window.__blatkom.game.scene.getScene('game')?.session?.phase?.() === 'finished', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1300);
const end = await S();
await page.screenshot({ path: `${out}_end.png` });
check(end && end.phase === 'finished' && end.fade > 0.5 && (end.pipe?.fade ?? 0) > 0.5, `the match's end: the colour drains (${JSON.stringify({ phase: end?.phase, fade: end?.fade, zoom: end?.zoom })})`);
console.log(results.join('\n'));
console.log(`${results.filter((r) => r.startsWith('✔')).length}/${results.length} checks passed`);
console.log(logs.slice(0, 10).join('\n') || 'no errors or warnings in the console');
await browser.close();
process.exit(results.every((r) => r.startsWith('✔')) && !logs.length ? 0 : 1);
