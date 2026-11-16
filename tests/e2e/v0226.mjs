// v0.2.26 (the owner: «сделай тогда просто FableCut главный… убери предыдущую»): the picture with shadows, bloom and
// the place's sound (docs/FABLE_CUT.md) is the game's only one. In the single-file demo, no server:
//
//   1. a first match with nothing asked for: the picture is on by itself, nothing on the screen names it, F2 does
//      nothing, the old switch is gone; a software renderer starts on the lowest step and saves nothing;
//   2. the match's moments one by one on «Кино» (`?fablelock` pins the quality — a software renderer would start on
//      the lowest step): the opening pan, the recoil spring, three kills in a row (the camera's punch, «ДВОЙНОЕ!»,
//      «ТРОЙНОЕ!», blood on the wall), low health, the pause menu's «Качество картинки», the match's end;
//   3. the game's own step down (the watch is made to fire): one step at a time, nothing baked again, the step
//      saved but not as the player's choice, the next match starting there, the lowest step without the finish
//      pass, «Быстро» shown for it, a tap on another quality making it the player's;
//   4. the settings screen on computers, a small window and phones (upright and sideways), in Russian and in
//      English: the quality's buttons are there, on the screen, over nothing — a row with its name where there is
//      room, on the panel's top edge after its tag where there is none; the screen is one view and nothing stands
//      out of its panel (the tape row's buttons did, at 800 px in Russian);
//   5. `?fable=0`: the plain light map of the versions before still carries a match (a browser without the shaders).
//
// Usage: node tests/e2e/v0226.mjs <path-to-blatkom89-demo.html> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const href = pathToFileURL(resolve(file)).href;
const W = 1280;
const H = 720;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const logs = [];
const check = (ok, text) => {
  results.push(!!ok);
  console.log(ok ? '✔' : '✖', text);
};

/** A browser with the first-run dialogs out of the way; `settings` are stored once (a reload keeps what the game saved since). */
async function open({ query = '', settings = {}, lang = 'ru', viewport = { width: W, height: H }, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-US', hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(
    ([s, l]) => {
      try {
        if (localStorage.getItem('e2e.v0226')) return;
        localStorage.setItem('e2e.v0226', '1');
        const kv = { 'blatkom89.lang.v1': l, 'blatkom89.welcome.v1': String(Date.now()), 'blatkom89.story.prologue.v1': '1', 'blatkom89.matches-done.v1': '3', 'blatkom89.hints.v1': '9', 'blatkom89.tutorial.v1': '1', 'blatkom89.settings.v1': JSON.stringify(s) };
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
      } catch {
        /* no storage */
      }
    },
    [settings, lang],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/ERR_TUNNEL|ERR_FILE_NOT_FOUND|Failed to load resource|GPU stall|willReadFrequently/.test(m.text()) && logs.push(`[${m.type()}] ${m.text()}`));
  await boot(page, query);
  return { ctx, page };
}

async function boot(page, query) {
  await page.goto(href + query);
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return (!b || b.classList.contains('boot--hidden')) && !!window.__blatkom?.app; }, null, { timeout: 120000 });
  const nick = page.locator('.modal input.input').first();
  if (await nick.waitFor({ timeout: 6000 }).then(() => true, () => false)) {
    await nick.fill('tester');
    await page.locator('.modal .btn--red').last().click();
  }
  await page.waitForTimeout(400);
}

const practice = async (page, map = 'factory', until = 'active') => {
  await page.evaluate((m) => window.__blatkom.app.startPractice({ mapId: m, bots: 5, difficulty: 'easy', gameMode: 'ffa' }), map);
  await page.waitForFunction((p) => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === p, until, { timeout: 120000 });
};

/** The match as the page has it. */
const S = (page) =>
  page.evaluate(() => {
    const g = window.__blatkom.game;
    const sc = g.scene.getScene('game');
    if (!sc?.session) return null;
    const me = sc.session.players().find((p) => p.isLocal);
    const f = sc.fable;
    const pp = sc.cameras.main.postPipelines;
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem('blatkom89.settings.v1') ?? 'null');
    } catch {
      /* none */
    }
    return {
      phase: sc.session.phase(),
      cam: { x: Math.round(sc.camX), y: Math.round(sc.camY) },
      me: me ? { x: Math.round(me.x), y: Math.round(me.y), hp: me.hp, alive: me.alive } : null,
      on: f.on,
      level: f.level,
      tier: f.tier,
      locked: f.locked,
      intro: !!f.intro,
      introDone: f.introDone,
      fade: f.fade,
      zoom: sc.cameras.main.zoom,
      pipe: f.pipeline ? { lowHp: +f.pipeline.lowHp.toFixed(2), fade: +f.pipeline.fade.toFixed(2), bloom: f.pipeline.bloomPasses } : null,
      posts: pp.length === 0 ? 'none' : pp.length === 1 && pp[0] === f.pipeline ? 'finish' : pp.length === 1 && pp[0] === sc.vhs ? 'tape' : `other(${pp.length})`,
      shadows: !!sc.lighting.shadows,
      lightRes: sc.lighting.shadows ? sc.lighting.shadows.res : null,
      placeSound: !!window.__blatkom.sfx.fable,
      bed: !!window.__blatkom.sfx.bed,
      stored: stored ? { quality: stored.quality, picked: stored.qualityPicked === true } : null,
    };
  });

const software = async (page) =>
  page.evaluate(() => {
    try {
      const gl = window.__blatkom.game.renderer.gl;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      return { name, soft: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) };
    } catch {
      return { name: '?', soft: false };
    }
  });

/**
 * The lamps as they were baked into the map's one picture: how many of the steady ones are bright where they hang
 * (against the night's own light), and whether the flickering ones still have their pictures.
 */
const bakedProbe = (page) =>
  page.evaluate(() => {
    const sh = window.__blatkom.game.scene.getScene('game').lighting.shadows;
    if (!sh) return null;
    const b = sh.baked;
    const ctx = b.base.getContext('2d');
    const lum = (x, y) => { const d = ctx.getImageData(Math.max(0, Math.min(b.base.width - 1, Math.round(x * b.res))), Math.max(0, Math.min(b.base.height - 1, Math.round(y * b.res))), 1, 1).data; return d[0] + d[1] + d[2]; };
    const night = ((sh.ambient >> 16) & 255) + ((sh.ambient >> 8) & 255) + (sh.ambient & 255);
    let steady = 0;
    let lit = 0;
    sh.map.lights.forEach((l, i) => {
      if (l.flicker === 'soft' || l.flicker === 'broken' || l.intensity < 0.3) return;
      steady++;
      const o = b.origins[i];
      if (lum(o.x, o.y) > night + 40) lit++;
    });
    return { w: b.base.width, h: b.base.height, res: b.res, night, steady, lit, cookies: b.cookies.length, alive: b.cookies.filter((c) => c.canvas.width > 0 && c.canvas.height > 0).length, mapW: sh.map.width };
  });

/** The pause menu's settings, opened the way the «Настройки» button opens them. */
const pauseSettings = async (page) => {
  await page.evaluate(() => { const a = window.__blatkom.app; if (!a.pauseEl) a.togglePause(); a.togglePause(); a.showSettingsOverlay(); });
  await page.locator('.overlay [data-testid=settings-quality]').waitFor({ timeout: 10000 });
};
const closeSettings = (page) => page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const pressed = (page, scope = '') => page.evaluate((sc) => [...document.querySelectorAll(`${sc} [data-testid=settings-quality] button`)].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(' | '), scope);

try {
  // ── 1. a first match, nothing asked for ─────────────────────────────────────────────────────────────
  console.log('\n— a first match with nothing asked for');
  {
    const { ctx, page } = await open({ settings: { vhs: 1 } });
    const gpu = await software(page);
    await page.mouse.click(W / 2, H / 2);
    await practice(page);
    await page.waitForTimeout(1500);
    const s = await S(page);
    check(s.on && s.shadows && s.placeSound, `the picture with shadows and the place's sound are on by themselves (${JSON.stringify({ on: s.on, shadows: s.shadows, sound: s.placeSound })})`);
    if (gpu.soft) check(s.level === -1 && s.posts === 'none' && !s.locked, `a software renderer («${gpu.name.slice(0, 60)}») starts on the lowest step, without a full-screen pass (${JSON.stringify({ level: s.level, posts: s.posts })})`);
    else check(s.level >= 1 && s.posts === 'finish', `a graphics card («${gpu.name.slice(0, 60)}»): «Кино» (or «Баланс» on a small machine) with the finish pass (${JSON.stringify({ level: s.level, posts: s.posts })})`);
    check(s.stored === null || (s.stored.quality === undefined || s.stored.quality === 2) && !s.stored.picked, `…and nothing is saved about it (${JSON.stringify(s.stored)})`);
    const marks = await page.evaluate(() => window.__blatkom.game.scene.getScene('hud').children.list.filter((o) => o.type === 'Text' && /FABLE|КЛАССИК|CLASSIC|\bF2\b/i.test(String(o.text))).map((o) => o.text));
    check(marks.length === 0, `nothing on the screen names the picture (${marks.join(', ') || 'no mark'})`);
    await page.evaluate(() => { window.__blatkom.game.scene.getScene('game').lighting.shadows.e2eMark = 1; });
    await page.keyboard.press('F2');
    await page.waitForTimeout(700);
    const f2 = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); return { on: sc.fable.on, same: sc.lighting.shadows?.e2eMark === 1, level: sc.fable.level }; });
    check(f2.on && f2.same && f2.level === s.level, `F2 is no longer a key of the game (${JSON.stringify(f2)})`);
    await pauseSettings(page);
    const old = await page.locator('[data-testid=settings-look], [data-testid=settings-tier]').count();
    const label = await page.locator('.overlay .settings__quality > .muted').innerText();
    check(old === 0 && /Качество картинки/i.test(label), `the pause menu's settings: no «Fable cut | Классика» switch, a «${label}» row (${await pressed(page, '.overlay')})`);
    await page.screenshot({ path: `${outDir}/01-first-match-settings.png` });
    await closeSettings(page);
    await ctx.close();
  }

  // ── 2. the moments, on «Кино» ───────────────────────────────────────────────────────────────────────
  console.log('\n— the match\'s moments on «Кино»');
  {
    const { ctx, page } = await open({ query: '?fablelock', settings: { quality: 2, vhs: 1 } });
    await page.mouse.click(W / 2, H / 2);
    await practice(page, 'factory', 'countdown');
    await page.waitForTimeout(350);
    const a = await S(page);
    await page.screenshot({ path: `${outDir}/02-opening-a.png` });
    await page.waitForTimeout(900);
    const b = await S(page);
    await page.waitForFunction(() => window.__blatkom.game.scene.getScene('game').session.phase() === 'active', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const c = await S(page);
    const dist = (s) => Math.hypot(s.cam.x - s.me.x, s.cam.y - s.me.y);
    check(a.intro && dist(a) > 75, `the opening starts away from the player (${Math.round(dist(a))} px)`);
    check(dist(b) < dist(a), `…and glides in (${Math.round(dist(b))} px a second later)`);
    check(c.introDone && dist(c) < 75, `by «go» the camera is the player's (${Math.round(dist(c))} px with the aim's look-ahead)`);
    check(c.on && c.level === 2 && c.pipe?.bloom === 3 && c.posts === 'finish' && c.lightRes === 1, `«Кино»: every light at full size, three bloom passes, the finish pass alone on the camera (${JSON.stringify({ level: c.level, pipe: c.pipe, posts: c.posts, res: c.lightRes })})`);
    check(c.bed, 'the bed under the fight is playing');
    const bk = await bakedProbe(page);
    check(bk && bk.w === Math.ceil(bk.mapW * bk.res) && bk.steady > 0 && bk.lit >= bk.steady * 0.8 && bk.alive === bk.cookies, `the lamps are baked into the map's one picture: ${bk?.lit} of ${bk?.steady} steady lamps bright where they hang (the night is ${bk?.night} of 765), ${bk?.alive} of ${bk?.cookies} flickering ones with pictures of their own (${bk?.w}×${bk?.h})`);
    await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' });
    // freeze the bots where they are so the staged moments are the same every run
    await page.evaluate(() => { window.__blatkom.game.scene.getScene('game').session.brains.length = 0; });
    await page.mouse.move(W * 0.75, H * 0.5);
    await page.waitForTimeout(300);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outDir}/03-fire.png` });
    await page.mouse.up();
    await page.waitForTimeout(500);
    // the spring itself, stepped at 60 frames a second (this machine draws a few frames a second: a kick is over within one)
    const spring = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const f = sc.fable; const players = sc.session.players(); const me = players.find((p) => p.isLocal); f.cam.x = f.cam.y = f.kvx = f.kvy = 0; f.recoil(0, 0.5); let max = 0, at = 0; const curve = []; for (let i = 1; i <= 60; i++) { f.update(sc.time.now, 1000 / 60, players, me, new Set(), false); const d = Math.hypot(f.cam.x, f.cam.y); if (d > max) { max = d; at = i; } if (i % 6 === 0) curve.push(+f.cam.x.toFixed(2)); } return { max: +max.toFixed(2), atFrame: at, end: +Math.hypot(f.cam.x, f.cam.y).toFixed(3), curve }; });
    check(spring.max > 1.5 && spring.max <= 11.01 && spring.atFrame >= 2 && spring.atFrame <= 8, `a shot kicks the camera back along the barrel: ${spring.max} px at frame ${spring.atFrame} of 60 a second (${spring.curve.join(', ')})`);
    check(spring.end < 0.05, `…and it is back at rest within a second (${spring.end} px)`);
    // a run of kills: the session's own «kill» events, three in a row, a wall behind the victim
    const run = await page.evaluate(async () => {
      const sc = window.__blatkom.game.scene.getScene('game');
      const f = sc.fable;
      const w = sc.session.world;
      const me = w.players.get('local');
      const col = w.collision;
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
    await page.screenshot({ path: `${outDir}/04-streak.png` });
    check(run && run.punch === 1 && run.streak === 3, `three kills in a row: each punches the camera, the run is counted (${JSON.stringify(run)})`);
    check(run && run.banners.length === 2, `…and called out twice (${run?.banners.join(', ')})`);
    check(run && run.wallBlood >= 1, `blood on the wall behind (${run?.wallBlood} splashes on a wall ${run?.wall} px away)`);
    const punch = await page.evaluate(() => { const sc = window.__blatkom.game.scene.getScene('game'); const f = sc.fable; const players = sc.session.players(); const me = players.find((p) => p.isLocal); f.punch = 1; let zmax = 0; for (let i = 1; i <= 30; i++) { f.update(sc.time.now, 1000 / 60, players, me, new Set(), false); zmax = Math.max(zmax, sc.cameras.main.zoom); } return { zmax: +zmax.toFixed(4), zend: sc.cameras.main.zoom }; });
    check(punch.zmax > 2.02 && punch.zmax < 2.07 && punch.zend === 2, `a kill punches the camera in and lets go: zoom ${punch.zmax} at most, ${punch.zend} half a second later`);
    await page.waitForTimeout(900);
    check(Math.abs((await S(page)).zoom - 2) < 1e-6, 'the zoom is back at exactly 2');
    // low health
    await page.evaluate(() => { window.__blatkom.game.scene.getScene('game').session.world.players.get('local').hp = 14; });
    let low = 0;
    for (let i = 0; i < 16; i++) { await page.waitForTimeout(90); low = Math.max(low, (await S(page)).pipe?.lowHp ?? 0); }
    await page.screenshot({ path: `${outDir}/05-low-health.png` });
    check(low > 0.3, `at 14 health the picture drains and beats (${low})`);
    await page.evaluate(() => { window.__blatkom.game.scene.getScene('game').session.world.players.get('local').hp = 100; });
    await page.waitForTimeout(500);
    check(((await S(page)).pipe?.lowHp ?? 1) === 0, 'healed: the picture is clean again');
    // the pause menu's «Качество картинки»
    await page.evaluate(() => { window.__blatkom.game.scene.getScene('game').lighting.shadows.e2eMark = 1; });
    await pauseSettings(page);
    const before = await pressed(page, '.overlay');
    await page.locator('.overlay [data-testid=settings-quality] button[data-quality="1"]').click();
    await page.waitForTimeout(900);
    const bal = await S(page);
    const rebaked = await page.evaluate(() => window.__blatkom.game.scene.getScene('game').lighting.shadows?.e2eMark !== 1);
    await page.screenshot({ path: `${outDir}/06-pause-quality.png` });
    check(/Кино\*/.test(before) && bal.level === 1 && bal.pipe?.bloom === 2 && bal.lightRes === 0.5 && rebaked && bal.stored?.quality === 1 && bal.stored?.picked, `the pause menu: «${before}» → «Баланс»: two bloom passes, the lamps baked again at half size, saved as the player's choice (${JSON.stringify({ level: bal.level, pipe: bal.pipe, res: bal.lightRes, stored: bal.stored })}; now «${await pressed(page, '.overlay')}»)`);
    await page.locator('.overlay [data-testid=settings-quality] button[data-quality="2"]').click();
    await page.waitForTimeout(900);
    const cine = await S(page);
    check(cine.level === 2 && cine.pipe?.bloom === 3 && cine.lightRes === 1 && cine.posts === 'finish', `…and back to «Кино» (${JSON.stringify({ level: cine.level, pipe: cine.pipe, res: cine.lightRes })})`);
    await closeSettings(page);
    // the end
    await page.evaluate(() => { const w = window.__blatkom.game.scene.getScene('game').session.world; w.matchEndsAt = w.time + 300; });
    await page.waitForFunction(() => window.__blatkom.game.scene.getScene('game')?.session?.phase?.() === 'finished', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1300);
    const end = await S(page);
    await page.screenshot({ path: `${outDir}/07-end.png` });
    check(end && end.phase === 'finished' && end.fade > 0.5 && (end.pipe?.fade ?? 0) > 0.5, `the match's end: the colour drains (${JSON.stringify({ phase: end?.phase, fade: end?.fade })})`);
    await ctx.close();
  }

  // ── 3. the game's own step down ─────────────────────────────────────────────────────────────────────
  console.log('\n— the game\'s own step down, remembered');
  {
    const { ctx, page } = await open({ query: '?fablelock', settings: { quality: 2, vhs: 1 } });
    await page.mouse.click(W / 2, H / 2);
    await practice(page);
    await page.waitForTimeout(800);
    // the watch is made to fire: this machine's own frame rate says nothing (and `?fablelock` pins the quality)
    const step = () =>
      page.evaluate(() => {
        const sc = window.__blatkom.game.scene.getScene('game');
        const f = sc.fable;
        if (sc.lighting.shadows && !sc.lighting.shadows.e2eMark) sc.lighting.shadows.e2eMark = Math.random();
        const mark = sc.lighting.shadows?.e2eMark;
        f.locked = false;
        f.perf.frame = () => true;
        f.watch(false);
        const gaveUp = f.locked;
        return { same: sc.lighting.shadows?.e2eMark === mark, gaveUp, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent).filter((t) => /упрост/i.test(t)).length };
      });
    const s0 = await S(page);
    const t1 = await step();
    const s1 = await S(page);
    check(s0.level === 2 && s1.level === 1 && s1.pipe?.bloom === 2 && t1.same && s1.lightRes === 1, `too slow on «Кино»: one step to «Баланс» — two bloom passes at once, nothing baked again in the middle of a fight (${JSON.stringify({ level: s1.level, pipe: s1.pipe, sameLight: t1.same })})`);
    check(s1.stored?.quality === 1 && !s1.stored?.picked, `the step is saved, and not as the player's choice (${JSON.stringify(s1.stored)})`);
    check(t1.toasts === 1, `the player is told once (${t1.toasts} notice)`);
    await page.screenshot({ path: `${outDir}/08-step-down.png` });
    const t2 = await step();
    const s2 = await S(page);
    check(s2.level === 0 && s2.pipe?.bloom === 0 && s2.posts === 'finish' && s2.stored?.quality === 0, `again: «Быстро» — no bloom, the finish pass still there (${JSON.stringify({ level: s2.level, pipe: s2.pipe, posts: s2.posts, stored: s2.stored })})`);
    check(t2.toasts <= 1, `…without a second notice in the same match (${t2.toasts})`);
    // the next match starts where this one ended up
    await page.evaluate(() => window.__blatkom.app.leaveMatch());
    await page.waitForTimeout(600);
    await practice(page, 'yard');
    await page.waitForTimeout(800);
    const n0 = await S(page);
    check(n0.level === 0 && n0.lightRes === 0.5 && n0.pipe?.bloom === 0, `the next match starts on the saved step, its lamps baked for it (${JSON.stringify({ level: n0.level, res: n0.lightRes, pipe: n0.pipe })})`);
    const bk2 = await bakedProbe(page);
    check(bk2 && bk2.res === 0.5 && bk2.steady > 0 && bk2.lit >= bk2.steady * 0.8 && bk2.alive === bk2.cookies, `…another map after the first: ${bk2?.lit} of ${bk2?.steady} steady lamps bright in its picture, ${bk2?.alive} of ${bk2?.cookies} flickering ones alive (${bk2?.w}×${bk2?.h})`);
    const t3 = await step();
    const s3 = await S(page);
    check(s3.level === -1 && s3.posts === 'none' && s3.shadows && s3.stored?.quality === -1 && !s3.stored?.picked, `still too slow: the lowest step — the light with shadows without a full-screen pass (${JSON.stringify({ level: s3.level, posts: s3.posts, shadows: s3.shadows, stored: s3.stored })})`);
    const t4 = await step();
    const s4 = await S(page);
    check(s4.level === -1 && s4.posts === 'none' && s4.shadows && t4.gaveUp && s4.stored?.quality === -1, `nothing is left to give up: the watch stops, the picture stays (${JSON.stringify({ level: s4.level, shadows: s4.shadows, stopped: t4.gaveUp })})`);
    await pauseSettings(page);
    const shown = await pressed(page, '.overlay');
    await page.locator('.overlay [data-testid=settings-quality] button[data-quality="0"]').click();
    await page.waitForTimeout(500);
    const same = await S(page);
    check(/Быстро\*/.test(shown) && same.level === -1 && !same.stored?.picked, `the settings show it as «Быстро» («${shown}»); a tap on it changes nothing (${JSON.stringify({ level: same.level, stored: same.stored })})`);
    await page.locator('.overlay [data-testid=settings-quality] button[data-quality="2"]').click();
    await page.waitForTimeout(1200);
    const mine = await S(page);
    await page.screenshot({ path: `${outDir}/09-picked-cinema.png` });
    check(mine.level === 2 && mine.posts === 'finish' && mine.pipe?.bloom === 3 && mine.lightRes === 1 && mine.stored?.quality === 2 && mine.stored?.picked, `a tap on «Кино»: everything back, and it is the player's now (${JSON.stringify({ level: mine.level, pipe: mine.pipe, res: mine.lightRes, stored: mine.stored })})`);
    await closeSettings(page);
    // a quality the player picked is never lowered: the same match without the address bar's pin
    await page.goto(href);
    await page.waitForFunction(() => { const b = document.getElementById('boot'); return (!b || b.classList.contains('boot--hidden')) && !!window.__blatkom?.app; }, null, { timeout: 120000 });
    await page.waitForTimeout(400);
    await page.mouse.click(W / 2, H / 2);
    await practice(page);
    await page.waitForTimeout(600);
    const kept = await S(page);
    check(kept.level === 2 && kept.locked && kept.posts === 'finish', `after a reload, with nothing in the address bar: the player's «Кино» is kept — even on this machine — and the watch leaves it alone (${JSON.stringify({ level: kept.level, locked: kept.locked, posts: kept.posts })})`);
    await ctx.close();
  }

  // ── 4. the settings screen ──────────────────────────────────────────────────────────────────────────
  console.log('\n— the settings screen: computers, a small window, phones');
  for (const lang of ['ru', 'en']) {
    for (const v of [
      { name: 'computer', width: 1366, height: 768, touch: false, row: true },
      { name: 'laptop', width: 1280, height: 600, touch: false, row: false },
      { name: 'window', width: 800, height: 600, touch: false, row: false },
      { name: 'phone', width: 360, height: 640, touch: true, row: false },
      { name: 'phone-tall', width: 390, height: 844, touch: true, row: true },
      { name: 'phone-sideways', width: 844, height: 390, touch: true, row: false },
    ]) {
      const { ctx, page } = await open({ settings: { vhs: 1 }, lang, viewport: { width: v.width, height: v.height }, touch: v.touch });
      await page.addStyleTag({ content: '.toast { display: none !important; }' });
      await page.evaluate(() => window.__blatkom.app.showSettings());
      await page.locator('.screen--settings [data-testid=settings-quality]').waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const vis = (el) => el.getClientRects().length > 0;
        const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
        const box = document.querySelector('.screen--settings [data-testid=settings-quality]');
        const panel = box.closest('.panel');
        const row = box.closest('.settings__quality');
        const q = r(box);
        const pr = r(panel);
        const tag = r(panel.querySelector(':scope > .tag'));
        const buttons = [...box.querySelectorAll('button')].map(r);
        const label = row.querySelector(':scope > .muted');
        const others = [...panel.querySelectorAll(':scope > .tag, .setrow:not(.settings__quality) .seg, .setrow:not(.settings__quality) > .muted')].filter(vis).map(r);
        // the screen's own measure (the older stages use it) and the lowest panel against the window
        const screen = document.querySelector('.ui .screen');
        const scroll = () => (screen ? screen.scrollHeight - screen.clientHeight : 0);
        const lowest = () => Math.round(Math.max(...[...document.querySelectorAll('.screen--settings .panel')].filter(vis).map((el) => el.getBoundingClientRect().bottom)));
        const withIt = { scroll: scroll(), lowest: lowest() };
        const was = row.style.display;
        row.style.display = 'none';
        const without = { scroll: scroll(), lowest: lowest() };
        row.style.display = was;
        // every button, name and slider of every panel stays inside its panel
        const out = [];
        for (const p of [...document.querySelectorAll('.screen--settings .panel')].filter(vis)) {
          const b = p.getBoundingClientRect();
          for (const c of p.querySelectorAll('button, .muted, input')) {
            if (!vis(c)) continue;
            const a = c.getBoundingClientRect();
            if (a.right > b.right + 1 || a.left < b.left - 1) out.push(`${(c.textContent || c.tagName).trim().slice(0, 20)} +${Math.round(Math.max(a.right - b.right, b.left - a.left))}`);
          }
        }
        return {
          n: buttons.length,
          inView: buttons.every((b) => b.w > 20 && b.h >= 23 && b.l >= 0 && b.r <= innerWidth + 0.5 && b.t >= 0 && b.b <= innerHeight + 0.5),
          inPanel: q.l >= pr.l - 1 && q.r <= pr.r + 1,
          oneLine: buttons.every((b) => Math.abs(b.t - buttons[0].t) < 1),
          over: others.filter((o) => hit(q, o)).length,
          labelShown: !!label && vis(label),
          afterTag: Math.round(q.l - tag.r),
          tagLine: Math.round(q.t + q.h / 2 - (tag.t + tag.h / 2)),
          text: [...box.querySelectorAll('button')].map((b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(' | '),
          h: Math.round(buttons[0]?.h ?? 0),
          withIt,
          without,
          vh: innerHeight,
          out,
          old: document.querySelectorAll('[data-testid=settings-look], [data-testid=settings-tier]').length,
        };
      });
      await page.screenshot({ path: `${outDir}/10-settings-${v.name}-${lang}.png` });
      const fits = m.withIt.scroll <= 0 && m.withIt.lowest <= m.vh;
      const placed = v.row ? m.labelShown : !m.labelShown && m.afterTag >= 4 && m.afterTag <= 16 && Math.abs(m.tagLine) <= 4 && m.withIt.lowest === m.without.lowest;
      check(
        m.n === 3 && m.inView && m.inPanel && m.oneLine && m.over === 0 && m.old === 0 && placed && fits && m.out.length === 0,
        `${v.name} ${v.width}×${v.height} ${lang}: «${m.text}» ${v.row ? 'in a row of its own with its name' : `on the panel's top edge, ${m.afterTag} px after its tag (no room taken: the panels end at ${m.withIt.lowest} px with it, ${m.without.lowest} without)`}; buttons ${m.h} px tall, over nothing (${m.over}); the screen is one view (${m.withIt.lowest} of ${m.vh} px, scroll ${m.withIt.scroll}); nothing stands out of its panel (${m.out.join(', ') || 'none'})`,
      );
      await ctx.close();
    }
  }

  // ── 5. the plain light map, for a browser that cannot draw the picture ──────────────────────────────
  console.log('\n— `?fable=0`: the plain light map still carries a match');
  {
    const { ctx, page } = await open({ query: '?fable=0', settings: { vhs: 1 } });
    await page.mouse.click(W / 2, H / 2);
    await practice(page, 'factory', 'countdown');
    // (the tape pass is read at once: on a slow machine the plain picture drops it by itself a few seconds in)
    const early = await S(page);
    await page.waitForFunction(() => window.__blatkom.game.scene.getScene('game').session.phase() === 'active', null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    const s = await S(page);
    const rt = await page.evaluate(() => { const l = window.__blatkom.game.scene.getScene('game').lighting; return !!l.rt && l.rt.visible; });
    await page.screenshot({ path: `${outDir}/11-plain-light.png` });
    check(!s.on && !s.shadows && rt && early.posts === 'tape' && !s.placeSound && !s.bed && s.me?.alive, `the plain light map, the tape pass, the plain sound; the match is played (${JSON.stringify({ on: s.on, shadows: s.shadows, light: rt, posts: early.posts, phase: s.phase })})`);
    await ctx.close();
  }
} catch (e) {
  console.error('[v0226]', e);
  results.push(false);
}
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
console.log(logs.length ? `console: ${logs.length} problem(s)\n${[...new Set(logs)].slice(0, 12).join('\n')}` : 'no errors or warnings in the console');
process.exit(passed === results.length && !logs.length ? 0 : 1);
