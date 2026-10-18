// Equipment E2E in the single-file demo (no server): every gadget — F-1, smoke, flashbang, molotov,
// mine, C4 and turret — is used through the real input path (the G key) against a frozen practice
// bot; the authoritative World state is checked and screenshots are taken.
//
// Usage: node tests/e2e/gadgets.mjs <path-to-blatkom89-demo.html> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const problems = [];
const results = [];
const check = (ok, what) => {
  results.push(!!ok);
  console.log(ok ? '✔' : '✖', what);
};
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`[console] ${m.text()}`));
const sleep = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });

try {
  await page.goto(pathToFileURL(resolve(file)).href);
  const input = page.getByRole('textbox', { name: 'Alias' });
  await input.waitFor({ timeout: 60000 });
  await input.fill('Tester');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.evaluate(() => localStorage.setItem('blatkom89.tutorial.v1', '1'));
  await page.getByRole('button', { name: /Practice/ }).click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  await sleep(600);

  // bots stand still; find an open lane: clear 360 px to the east, room around
  const spot = await page.evaluate(() => {
    const s = window.__blatkom.game.scene.getScene('game').session;
    s.brains.length = 0;
    const w = s.world;
    const c = w.collision;
    for (let y = 120; y < w.map.height - 120; y += 16)
      for (let x = 120; x < w.map.width - 480; x += 16) {
        if (c.overlapsCircle(x, y, 40)) continue;
        if (c.raycast(x, y, 1, 0, 380, 'shot')) continue;
        if (c.raycast(x, y, 0, 1, 120, 'shot') || c.raycast(x, y, 0, -1, 120, 'shot')) continue;
        if (c.raycast(x + 200, y, 0, 1, 110, 'shot') || c.raycast(x + 200, y, 0, -1, 110, 'shot')) continue;
        return { x, y };
      }
    return null;
  });
  check(spot, `open lane found at ${JSON.stringify(spot)}`);

  const setup = (gadget, botDx = 230) =>
    page.evaluate(
      ({ spot, gadget, botDx }) => {
        const s = window.__blatkom.game.scene.getScene('game').session;
        const w = s.world;
        const me = w.players.get('local');
        const bot = [...w.players.values()].find((p) => p.isBot);
        for (const p of [me, bot]) {
          if (!p.alive) w.spawnPlayer(p, false);
          p.hp = 100;
          p.vx = p.vy = 0;
        }
        me.x = spot.x;
        me.y = spot.y;
        me.invulnUntil = w.time + 60000;
        bot.x = spot.x + botDx;
        bot.y = spot.y;
        bot.invulnUntil = 0;
        me.gadget = gadget;
        me.gadgetCharges = 2;
        me.gadgetReadyAt = 0;
        me.flashedUntil = 0;
        w.gadgets.length = 0;
        // a fixed camera (no easing, no aim look-ahead) so the mouse maps to a stable world point
        window.__blatkom.game.scene.getScene('game').debugCam = { x: spot.x + 150, y: spot.y };
        return { me: me.slot, bot: bot.slot };
      },
      { spot, gadget, botDx },
    );
  const state = () =>
    page.evaluate(() => {
      const w = window.__blatkom.game.scene.getScene('game').session.world;
      const me = w.players.get('local');
      const bot = [...w.players.values()].find((p) => p.isBot);
      return { gadgets: w.gadgets.map((g) => ({ kind: g.kind, phase: g.phase, x: Math.round(g.x), y: Math.round(g.y), hp: g.hp })), charges: me.gadgetCharges, botHp: bot.hp, botAlive: bot.alive, botDeaths: bot.deaths, flashed: Math.max(0, me.flashedUntil - w.time), botFlashed: Math.max(0, bot.flashedUntil - w.time) };
    });
  const zoomAt = async (kind, name, half = 110) => {
    const at = await page.evaluate((kind) => {
      const sc = window.__blatkom.game.scene.getScene('game');
      const g = sc.session.world.gadgets.find((x) => x.kind === kind);
      const cam = sc.cameras.main;
      const r = sc.game.canvas.getBoundingClientRect();
      const k = r.width / sc.scale.width;
      return g ? { x: r.left + (g.x - cam.worldView.x) * cam.zoom * k, y: r.top + (g.y - cam.worldView.y) * cam.zoom * k } : null;
    }, kind);
    if (at) await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: Math.max(0, at.x - half), y: Math.max(0, at.y - half * 0.75), width: half * 2, height: half * 1.5 } });
  };
  // aim due east of the player: the camera is fixed (debugCam), re-check until the simulated aim follows
  const aimEast = async () => {
    await sleep(150);
    for (let i = 0; i < 20; i++) {
      const at = await page.evaluate(() => {
        const sc = window.__blatkom.game.scene.getScene('game');
        const me = sc.session.world.players.get('local');
        const cam = sc.cameras.main;
        const r = sc.game.canvas.getBoundingClientRect();
        const k = r.width / sc.scale.width;
        return { x: r.left + (me.x - cam.worldView.x) * cam.zoom * k, y: r.top + (me.y - cam.worldView.y) * cam.zoom * k };
      });
      await page.mouse.move(at.x + 300, at.y);
      await sleep(200);
      const aim = await page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.world.players.get('local').aim);
      if (Math.abs(aim) < 0.04) break;
    }
  };

  // ── F-1 ──
  await setup('f1');
  await aimEast();
  await page.keyboard.press('g');
  await sleep(250);
  let st = await state();
  check(st.gadgets.some((g) => g.kind === 'f1' && g.phase === 'moving') && st.charges === 1, `F-1 thrown (${JSON.stringify(st.gadgets)}, charges ${st.charges})`);
  await shot('g1_f1_flight');
  await sleep(1550);
  await shot('g1_f1_boom');
  st = await state();
  check(st.gadgets.length === 0 && (st.botHp < 100 || !st.botAlive), `F-1 exploded and hurt the bot (hp ${st.botHp}, alive ${st.botAlive})`);
  await sleep(400);

  // ── smoke ──
  await setup('smoke', 320);
  await aimEast();
  await page.keyboard.press('g');
  await sleep(2600);
  st = await state();
  check(st.gadgets.some((g) => g.kind === 'smoke' && g.phase === 'active'), 'smoke cloud is up');
  await shot('g2_smoke');
  await sleep(200);

  // ── flashbang (facing it) ──
  await setup('flash', 400);
  await aimEast();
  await page.keyboard.press('g');
  await sleep(1550);
  st = await state();
  check(st.flashed > 1000, `flashbang blinds the player who looks at it (${st.flashed} ms)`);
  const ov = await page.evaluate(() => {
    const hud = window.__blatkom.game.scene.getScene('hud');
    return { hud: hud.session.hud().flashedMs, vis: hud.flashOverlay.visible, alpha: hud.flashOverlay.alpha };
  });
  console.log('  overlay', JSON.stringify(ov));
  await shot('g3_flash');
  await sleep(1800);
  await shot('g3_flash_fade');

  // ── molotov ──
  await setup('molotov', 200);
  await aimEast();
  const deaths0 = (await state()).botDeaths;
  await page.keyboard.press('g');
  await sleep(1700);
  st = await state();
  check(st.gadgets.some((g) => g.kind === 'molotov' && g.phase === 'active'), `molotov burns (${JSON.stringify(st.gadgets)})`);
  // where exactly the bottle lands depends on the aim (frame timing in headless Chromium); the claim
  // checked here is that the fire hurts whoever stands in it, so the bot is moved into the flames
  await page.evaluate(() => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const fire = w.gadgets.find((g) => g.kind === 'molotov');
    const bot = [...w.players.values()].find((p) => p.isBot);
    if (fire && bot.alive) {
      bot.x = fire.x;
      bot.y = fire.y;
    }
  });
  await shot('g4_molotov');
  await zoomAt('molotov', 'g4_molotov_zoom', 200);
  await sleep(1500);
  st = await state();
  check(st.botHp < 100 || !st.botAlive || st.botDeaths > deaths0, `fire hurts the bot standing in it (hp ${st.botHp}, deaths ${deaths0} → ${st.botDeaths})`);

  // ── mine ──
  await setup('mine', 400);
  await aimEast();
  await page.keyboard.press('g');
  await sleep(1500);
  st = await state();
  check(st.gadgets.some((g) => g.kind === 'mine' && g.phase === 'armed'), `mine placed and armed (${JSON.stringify(st.gadgets)})`);
  // step away and walk the bot onto it
  await page.evaluate((spot) => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const me = w.players.get('local');
    me.x = spot.x + 110;
    const bot = [...w.players.values()].find((p) => p.isBot);
    bot.x = spot.x + 60;
    bot.y = spot.y;
  }, spot);
  await sleep(500);
  await shot('g5_mine_placed');
  await zoomAt('mine', 'g5_mine_zoom');
  await page.evaluate((spot) => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const bot = [...w.players.values()].find((p) => p.isBot);
    bot.x = spot.x + 8;
  }, spot);
  await sleep(400);
  await shot('g5_mine_boom');
  st = await state();
  check(st.gadgets.length === 0 && (st.botHp < 100 || !st.botAlive), `mine triggered by the opponent (hp ${st.botHp}, alive ${st.botAlive})`);

  // ── C4: place, back off, press again ──
  await setup('c4', 120);
  await aimEast();
  await page.keyboard.press('g');
  await sleep(900);
  await page.evaluate((spot) => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    w.players.get('local').x = spot.x + 160;
    const bot = [...w.players.values()].find((p) => p.isBot);
    bot.x = spot.x + 30;
  }, spot);
  await sleep(400);
  st = await state();
  check(st.gadgets.some((g) => g.kind === 'c4'), 'C4 placed');
  await shot('g6_c4_armed');
  await zoomAt('c4', 'g6_c4_zoom');
  await page.keyboard.press('g');
  await sleep(150);
  await shot('g6_c4_boom');
  st = await state();
  check(st.gadgets.length === 0 && (st.botHp < 100 || !st.botAlive), `C4 detonated by the second press (hp ${st.botHp})`);
  await sleep(600);

  // ── turret ──
  await setup('turret', 260);
  await aimEast();
  await page.keyboard.press('g');
  await sleep(1400);
  await page.evaluate(() => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const bot = [...w.players.values()].find((p) => p.isBot);
    bot.hp = 100;
  });
  await sleep(500);
  await shot('g7_turret');
  st = await state();
  check(st.gadgets.some((g) => g.kind === 'turret' && g.phase === 'active'), `turret deployed (${JSON.stringify(st.gadgets)})`);
  check(st.botHp < 100 || !st.botAlive, `turret shoots the opponent (hp ${st.botHp})`);
  // zoomed crop around the turret for the art check
  const tur = await page.evaluate(() => {
    const sc = window.__blatkom.game.scene.getScene('game');
    const g = sc.session.world.gadgets.find((x) => x.kind === 'turret');
    const cam = sc.cameras.main;
    const r = sc.game.canvas.getBoundingClientRect();
    const k = r.width / sc.scale.width;
    return g ? { x: r.left + (g.x - cam.worldView.x) * cam.zoom * k, y: r.top + (g.y - cam.worldView.y) * cam.zoom * k } : null;
  });
  if (tur) await page.screenshot({ path: `${outDir}/g7_turret_zoom.png`, clip: { x: Math.max(0, tur.x - 120), y: Math.max(0, tur.y - 90), width: 240, height: 180 } });

  // ── the arsenal screens ──
  await page.keyboard.press('Escape');
  await sleep(500);
} catch (e) {
  problems.push(`[script] ${e.stack || e.message}`);
}
console.log(problems.length ? `problems:\n${problems.join('\n')}` : 'no page errors');
const ok = results.every(Boolean) && problems.length === 0;
console.log(ok ? '[gadgets] passed' : '[gadgets] FAILED');
await browser.close();
process.exit(ok ? 0 : 1);
