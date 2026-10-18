// Online end-to-end test: two independent browser contexts (separate storage = separate players)
// create a private room, join it by invite link, play one match through the real server, see the
// same results, and get XP persisted to PostgreSQL. A picks a personal nickname in the first-launch
// dialog; B must see it in the lobby and the results. Optionally logs into the admin dashboard.
//
// Usage: node tests/e2e/online.mjs <baseUrl> <outDir> [adminUser] [adminPass]
// The server should run with a short match (e.g. MATCH_DURATION_SEC=40) and DEV_AUTH_ENABLED=true.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/online.mjs <baseUrl> <outDir> [adminUser] [adminPass]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const report = { steps: [] };
const step = (s) => {
  report.steps.push(s);
  console.log('•', s);
};

async function player(name, character) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((c) => {
    try {
      localStorage.setItem('blatkom89.character', c);
    } catch {}
  }, character);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  return { name, ctx, page };
}

const phaseOf = (p) => p.page.evaluate(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() ?? null);

const A = await player('A', 'petya');
const B = await player('B', 'valuta');
// any failure: screenshots + what each browser was showing, then exit 1
process.on('uncaughtException', async (e) => {
  console.error('[online] failed:', e.message);
  for (const p of [A, B]) {
    await p.page.screenshot({ path: `${outDir}/fail_${p.name}.png` }).catch(() => {});
    const text = await p.page.evaluate(() => document.querySelector('#ui')?.innerText?.slice(0, 400) ?? '').catch(() => '');
    console.error(`[online] ${p.name} screen:`, text.replace(/\s+/g, ' '));
  }
  console.error(problems.join('\n'));
  await browser.close().catch(() => {});
  process.exit(1);
});

// ── nickname (first launch) ───────────────────────────────────────────────
const NICK_A = 'Courtyard Commandant';
await A.page.goto(base + '/');
const nickInput = A.page.getByRole('textbox', { name: 'Alias' });
await nickInput.waitFor({ timeout: 60000 });
await nickInput.fill(NICK_A);
await A.page.getByRole('button', { name: 'Done' }).click();
await A.page.getByTestId('menu-nick').filter({ hasText: NICK_A }).waitFor({ timeout: 20000 });
const stripA = (await A.page.getByTestId('profile-strip').innerText()).replace(/\s+/g, ' ');
step(`A set the nickname «${NICK_A}» in the first-launch dialog; menu strip: ${stripA}`);
await A.page.screenshot({ path: `${outDir}/online_menu_A.png` });

// ── lobby ─────────────────────────────────────────────────────────────────
await A.page.getByRole('button', { name: /Play with Friends/ }).click({ timeout: 30000 });
await A.page.getByRole('button', { name: 'Create a room' }).click();
const code = (await A.page.locator('.code').textContent({ timeout: 20000 })).trim();
step(`A created a private room, invite code ${code}`);
await B.page.goto(`${base}/?invite=${encodeURIComponent(code)}`);
// a new player who opens an invite link picks a nickname before entering the room
const NICK_B = 'Night Owl';
const nickInputB = B.page.getByRole('textbox', { name: 'Alias' });
await nickInputB.waitFor({ timeout: 60000 });
await nickInputB.fill(NICK_B);
await B.page.getByRole('button', { name: 'Done' }).click();
step(`B opened the invite link and chose the nickname «${NICK_B}» before joining`);
try {
  await A.page.getByText(/Players 2\//).waitFor({ timeout: 90000 });
  await B.page.getByText(/Players 2\//).waitFor({ timeout: 90000 });
} catch (e) {
  await A.page.screenshot({ path: `${outDir}/fail_lobby_A.png` });
  await B.page.screenshot({ path: `${outDir}/fail_lobby_B.png` });
  console.log(problems.join('\n'));
  throw e;
}
step('B joined through the invite link; both lobbies show 2 players');
report.nickInLobbyB = (await B.page.getByText(NICK_A).count()) > 0;
report.nickInLobbyA = (await A.page.getByText(NICK_B).count()) > 0;
step(`lobbies show the nicknames: A's on B ${report.nickInLobbyB}, B's on A ${report.nickInLobbyA}`);
await A.page.screenshot({ path: `${outDir}/online_lobby_A.png` });
await B.page.getByRole('button', { name: /^Ready$/ }).click();
await A.page.getByRole('button', { name: /^Start/ }).click();
await Promise.all(
  [A, B].map((p) => p.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 })),
);
step('host started the match; both clients reached phase "active"');

// ── equipment over the network: A throws the default F-1 (G key); B sees it fly and explode ──
{
  const before = await A.page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.hud().gadgetCharges);
  const slotA = await A.page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.localSlot());
  await A.page.keyboard.press('g');
  const seen = await B.page
    .waitForFunction((slot) => window.__blatkom.game.scene.getScene('game').session.gadgets().some((g) => g.kind === 'f1' && g.owner === slot), slotA, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const gone = await B.page
    .waitForFunction(() => window.__blatkom.game.scene.getScene('game').session.gadgets().length === 0, null, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  const after = await A.page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.hud().gadgetCharges);
  report.equipment = { chargesBefore: before, chargesAfter: after, seenOnB: seen, explodedOnB: gone };
  step(`equipment: A threw an F-1 (charges ${before} → ${after}); B saw it ${seen}, explosion ${gone}`);
}

// ── play ──────────────────────────────────────────────────────────────────
const state = (p) =>
  p.page.evaluate(() => {
    const g = window.__blatkom.game;
    const scene = g.scene.getScene('game');
    const s = scene?.session;
    if (!s) return null;
    const cam = scene.cameras.main;
    const canvas = g.canvas.getBoundingClientRect();
    const k = canvas.width / g.scale.width;
    const players = s.players().map((q) => ({ slot: q.slot, x: q.x, y: q.y, alive: q.alive, isLocal: q.isLocal, hp: q.hp }));
    const me = players.find((q) => q.isLocal);
    const screen = me ? { x: canvas.left + (me.x - cam.worldView.x) * cam.zoom * k, y: canvas.top + (me.y - cam.worldView.y) * cam.zoom * k } : null;
    return { phase: s.phase(), players, me, screen, hud: s.hud() };
  });

const deviations = [];
const held = { A: new Set(), B: new Set() };
async function setKeys(p, keys) {
  const cur = held[p.name];
  for (const k of [...cur]) if (!keys.has(k)) (await p.page.keyboard.up(k), cur.delete(k));
  for (const k of keys) if (!cur.has(k)) (await p.page.keyboard.down(k), cur.add(k));
}
let shotsSeen = 0;
let fireHeld = { A: false, B: false };
const t0 = Date.now();
let lastShot = 0;
while (Date.now() - t0 < 120000) {
  const [sa, sb] = await Promise.all([state(A), state(B)]);
  if (!sa || !sb) break;
  if (sa.phase !== 'active' && sb.phase !== 'active') break;
  // consistency: where A is on A's own screen vs where B's client shows A
  if (sa.me && sa.me.alive) {
    const onB = sb.players.find((q) => q.slot === sa.me.slot);
    if (onB && onB.alive) deviations.push(Math.hypot(onB.x - sa.me.x, onB.y - sa.me.y));
  }
  // simple steering: walk toward the opponent, aim at them and shoot when close
  for (const [p, s] of [
    [A, sa],
    [B, sb],
  ]) {
    if (!s.me || !s.screen) continue;
    const foe = s.players.find((q) => !q.isLocal && q.alive);
    const keys = new Set();
    if (foe && s.me.alive) {
      const dx = foe.x - s.me.x;
      const dy = foe.y - s.me.y;
      const d = Math.hypot(dx, dy);
      if (d > 90) {
        if (dx > 20) keys.add('KeyD');
        if (dx < -20) keys.add('KeyA');
        if (dy > 20) keys.add('KeyS');
        if (dy < -20) keys.add('KeyW');
      }
      await p.page.mouse.move(s.screen.x + (dx / (d || 1)) * 220, s.screen.y + (dy / (d || 1)) * 220);
      const fire = d < 330;
      if (fire && !fireHeld[p.name]) await p.page.mouse.down();
      if (!fire && fireHeld[p.name]) await p.page.mouse.up();
      fireHeld[p.name] = fire;
    }
    await setKeys(p, keys);
  }
  if (Date.now() - lastShot > 12000) {
    lastShot = Date.now();
    await Promise.all([A.page.screenshot({ path: `${outDir}/online_play_A_${shotsSeen}.png` }), B.page.screenshot({ path: `${outDir}/online_play_B_${shotsSeen}.png` })]);
    shotsSeen++;
  }
  await A.page.waitForTimeout(120);
}
for (const p of [A, B]) {
  await setKeys(p, new Set());
  if (fireHeld[p.name]) await p.page.mouse.up();
}
deviations.sort((a, b) => a - b);
const median = deviations[Math.floor(deviations.length / 2)] ?? NaN;
const p90 = deviations[Math.floor(deviations.length * 0.9)] ?? NaN;
report.sync = { samples: deviations.length, medianPx: +median.toFixed(1), p90Px: +p90.toFixed(1), maxPx: +(deviations[deviations.length - 1] ?? NaN).toFixed(1) };
step(`position sync A(own) vs A(on B): median ${report.sync.medianPx}px, p90 ${report.sync.p90Px}px over ${deviations.length} samples`);

// ── results ───────────────────────────────────────────────────────────────
await Promise.all([A, B].map((p) => p.page.getByText('Match report').waitFor({ timeout: 60000 })));
// read head and body at once: the room returns to its lobby 15 s after the match (finishedMs)
const tableOf = (p) =>
  p.page.evaluate(() => {
    const t = document.querySelector('table.table');
    return { head: t?.tHead?.innerText ?? '', body: t?.tBodies[0]?.innerText ?? '' };
  });
const [ra, rb] = await Promise.all([tableOf(A), tableOf(B)]);
const ta = ra.body;
const tb = rb.body;
report.resultsIdentical = ta.length > 0 && ta === tb;
report.nickInResults = ta.includes(NICK_A);
report.assistsColumn = /\bAst\b/i.test(ra.head);
report.resultsTable = ta.split('\n').map((l) => l.trim());
step(`both clients show the results screen; tables identical: ${ta === tb}`);
await A.page.getByText(/\+\d+ XP/).waitFor({ timeout: 15000 }).catch(() => problems.push('XP panel did not appear for A'));
await Promise.all([A.page.screenshot({ path: `${outDir}/online_results_A.png` }), B.page.screenshot({ path: `${outDir}/online_results_B.png` })]);

// ── persistence ───────────────────────────────────────────────────────────
const profileOf = (p) =>
  p.page.evaluate(async () => {
    const t = localStorage.getItem('blatkom89.token');
    const r = await fetch('api/me', { headers: { authorization: `Bearer ${t}` } });
    return r.json();
  });
const [pa, pb] = await Promise.all([profileOf(A), profileOf(B)]);
report.profiles = [pa, pb].map((x) => ({ name: x.displayName, level: x.level, xp: x.xp, matchesPlayed: x.matchesPlayed, wins: x.wins, kills: x.kills, assists: x.assists, deaths: x.deaths }));
step(`profiles persisted: ${JSON.stringify(report.profiles)}`);

// ── admin dashboard ───────────────────────────────────────────────────────
if (adminUser && adminPass) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[admin pageerror] ${e.message}`));
  await page.goto(base + '/admin');
  await page.locator('input[name=username]').fill(adminUser);
  await page.locator('input[name=password]').fill(adminPass);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${outDir}/admin_overview.png`, fullPage: true });
  step('admin logged in; overview captured');
  await page.goto(base + '/admin#/players');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/admin_players.png`, fullPage: true });
  await ctx.close();
}

report.problems = problems;
console.log(JSON.stringify(report, null, 2));
await browser.close();
const ok =
  report.resultsIdentical &&
  report.profiles.every((p) => p.matchesPlayed >= 1 && typeof p.assists === 'number') &&
  report.profiles[0].name === NICK_A &&
  report.profiles[1].name === NICK_B &&
  report.nickInLobbyB &&
  report.nickInLobbyA &&
  report.nickInResults &&
  report.assistsColumn &&
  report.equipment?.seenOnB === true &&
  report.equipment?.explodedOnB === true &&
  report.equipment?.chargesAfter === report.equipment?.chargesBefore - 1 &&
  deviations.length > 0;
process.exit(ok ? 0 : 1);
