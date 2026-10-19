// Single-file demo E2E (no server): first-launch nickname dialog → practice match with the new
// scoring (an assist and a kill are staged through the real World API), a «deficit goods» supply drop,
// the Tab table → results with XP from the browser-only profile → menu profile tile and profile screen →
// capture the flag and base capture practice (flags, bases, HUD strip, objective events, team results) →
// the Arsenal dressing room → Russian language → reload keeps the profile.
//
// Usage: node tests/e2e/demo.mjs <path-to-blatkom89-demo.html> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node tests/e2e/demo.mjs <blatkom89-demo.html> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(resolve(file)).href;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`[console] ${m.text()}`));

const NICK = 'Quiet Quartermaster';
try {
  await page.goto(url);
  // ── first launch: nickname dialog ───────────────────────────────────────
  const input = page.getByRole('textbox', { name: 'Alias' });
  await input.waitFor({ timeout: 60000 });
  const suggested = await input.inputValue();
  check(suggested.length >= 2, `first launch opens the nickname dialog with a suggestion («${suggested}»)`);
  await page.getByRole('button', { name: 'Random alias' }).click();
  await input.fill(NICK);
  await page.screenshot({ path: `${outDir}/demo_nickname.png` });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('menu-nick').filter({ hasText: NICK }).waitFor({ timeout: 10000 });
  const badge0 = (await page.locator('[data-testid="profile-strip"] .lvlbadge').innerText()).replace(/\s+/g, ' ');
  check(/1$/.test(badge0), `menu profile tile shows the nickname and level 1 (${badge0})`);
  check((await page.getByTestId('arsenal-tile').count()) === 1, 'menu has the Arsenal tile');
  await page.screenshot({ path: `${outDir}/demo_menu.png` });

  // ── practice match ──────────────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('blatkom89.tutorial.v1', '1')); // keep the controls card out of the screenshots
  await page.getByRole('button', { name: /Practice/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  const me0 = await page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.players().find((p) => p.isLocal));
  check(me0.name === NICK && me0.level === 1, `in the match the local player is «${me0.name}», level ${me0.level}`);

  // stage an assist (local hits bot0 for 30, bot1 finishes it) and a kill (local finishes bot1)
  const scoring = await page.evaluate(() => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const ps = [...w.players.values()];
    const me = ps.find((p) => p.id === 'local');
    const [b0, b1] = ps.filter((p) => p.isBot);
    for (const p of ps) p.invulnUntil = 0;
    w.applyDamage(b0, me, 30, 'pistol');
    w.applyDamage(b0, b1, 200, 'pistol');
    w.applyDamage(b1, me, 200, 'pistol');
    return { score: me.score, kills: me.kills, assists: me.assists };
  });
  check(scoring.assists === 1 && scoring.kills === 1 && scoring.score === 3, `assist +1 and elimination +2 → ${scoring.score} points (kills ${scoring.kills}, assists ${scoring.assists})`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/demo_points_feed.png` });

  // supply drop: crate + banner + minimap marker (+ edge arrow when off-screen)
  const drop = await page.evaluate(() => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const pk = w.dropSupply();
    return pk ? { weapon: pk.weapon, x: pk.x, y: pk.y, mag: pk.mag, supply: pk.supply } : null;
  });
  check(drop && drop.supply, `a «deficit goods» crate dropped (${drop ? `${drop.weapon} at ${drop.x},${drop.y}` : 'none'})`);
  await page.waitForTimeout(900);
  const banner = await page.evaluate(() => {
    const hud = window.__blatkom.game.scene.getScene('hud');
    return !!hud.banner;
  });
  check(banner, 'the HUD shows the «DEFICIT GOODS DELIVERED!» banner');
  await page.screenshot({ path: `${outDir}/demo_supply.png` });
  // walk the camera over to the crate to see it in the world
  await page.evaluate(([x, y]) => (window.__blatkom.game.scene.getScene('game').debugCam = { x, y: y + 12 }), [drop.x, drop.y]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/demo_supply_crate.png` });
  await page.evaluate(() => (window.__blatkom.game.scene.getScene('game').debugCam = null));

  // Tab table with levels/assists
  await page.keyboard.down('Tab');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/demo_scoreboard.png` });
  await page.keyboard.up('Tab');

  // ── finish → results with XP ───────────────────────────────────────────
  await page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.world.finish('score'));
  await page.getByText('Match report').waitFor({ timeout: 20000 });
  await page.getByText(/\+\d+ XP/).first().waitFor({ timeout: 10000 });
  const xpText = await page.locator('.xpgain .h1').innerText();
  check(/\+\d+ XP/.test(xpText), `results show the XP earned (${xpText})`);
  const head = await page.locator('table.table thead').innerText();
  check(/\bAst\b/i.test(head), 'results table has the assists column');
  await page.screenshot({ path: `${outDir}/demo_results.png`, fullPage: true });

  // ── menu strip, profile, persistence ────────────────────────────────────
  await page.getByRole('button', { name: 'To menu' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 10000 });
  const xpLine = await page.locator('[data-testid="profile-strip"] .xp').innerText();
  check(!/^0 \//.test(xpLine), `menu profile tile XP updated (${xpLine})`);
  await page.locator('[data-testid="profile-strip"] .tile__body').click();
  await page.getByTestId('profile-name').waitFor({ timeout: 10000 });
  const stats = await page.locator('.stats').innerText();
  check(/1\s*matches/i.test(stats.replace(/\n/g, ' ')) && /assists/i.test(stats), 'profile screen: 1 match played, assists stat present');
  await page.screenshot({ path: `${outDir}/demo_profile.png`, fullPage: true });

  // ── capture the flag: practice with bots, a staged steal and capture ────
  await page.evaluate(() => window.__blatkom.app.goMenu());
  await page.getByRole('button', { name: /Practice/ }).click();
  await page.locator('.modebtn[data-mode="ctf"]').click();
  check((await page.locator('.modebtn').count()) === 4, 'practice offers four modes');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  const ctf = await page.evaluate(async () => {
    const s = window.__blatkom.game.scene.getScene('game').session;
    const w = s.world;
    const me = w.players.get('local');
    const enemy = w.flags.find((f) => f.team !== me.team);
    const own = w.flags.find((f) => f.team === me.team);
    const before = { mode: s.gameMode, flags: w.flags.length, team: me.team };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    Object.assign(me, { x: enemy.standX, y: enemy.standY, invulnUntil: w.time + 60000 });
    await wait(300);
    const carried = enemy.carrierId === 'local';
    Object.assign(me, { x: own.standX, y: own.standY });
    await wait(300);
    return { ...before, carried, captured: w.teamScore[me.team], strip: window.__blatkom.game.scene.getScene('hud').objTexts.map((x) => x.text) };
  });
  check(ctf.mode === 'ctf' && ctf.flags === 2 && ctf.team === 0, `capture the flag: two flags, the player is red (${JSON.stringify(ctf)})`);
  check(ctf.carried && ctf.captured === 1, 'the enemy flag is taken from its stand and captured at our own');
  check(ctf.strip.length === 2, `the HUD strip shows both flags (${ctf.strip.join(' / ')})`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/demo_ctf.png` });
  await page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.world.finish('score'));
  await page.getByText('Match report').waitFor({ timeout: 20000 });
  const ctfHead = await page.locator('table.table thead').innerText();
  check(/Flags/i.test(ctfHead) && (await page.locator('.teamwin').count()) === 1, 'capture the flag results: team banner and a Flags column');

  // ── base capture ────────────────────────────────────────────────────────
  await page.evaluate(() => window.__blatkom.app.startPractice({ mapId: 'yard', bots: 3, difficulty: 'easy', gameMode: 'bases' }));
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 60000 });
  const bases = await page.evaluate(async () => {
    const w = window.__blatkom.game.scene.getScene('game').session.world;
    const me = w.players.get('local');
    const b = w.bases[1];
    for (const p of w.players.values()) if (p.id !== 'local') Object.assign(p, { x: 60, y: 60 });
    window.__blatkom.game.scene.getScene('game').session.brains.length = 0;
    Object.assign(me, { x: b.x, y: b.y, invulnUntil: w.time + 60000 });
    await new Promise((r) => setTimeout(r, 7500));
    return { n: w.bases.length, owner: b.owner, team: me.team, score: w.teamScore[me.team] };
  });
  check(bases.n === 3 && bases.owner === bases.team && bases.score >= 1, `base capture: base B taken in ~6 s and scoring (${JSON.stringify(bases)})`);
  await page.screenshot({ path: `${outDir}/demo_bases.png` });

  // ── Arsenal dressing room ───────────────────────────────────────────────
  await page.evaluate(() => window.__blatkom.app.goMenu());
  await page.getByTestId('arsenal-tile').click();
  await page.getByTestId('dressing-room').waitFor({ timeout: 10000 });
  const heroOk = await page.locator('[data-testid="dressing-room"] img').first().evaluate((img) => img.complete && img.naturalWidth > 0);
  check(heroOk, 'the Arsenal dressing room shows the character art');
  await page.screenshot({ path: `${outDir}/demo_arsenal.png` });

  // ── Russian ─────────────────────────────────────────────────────────────
  await page.evaluate(() => window.__blatkom.app.goMenu());
  await page.locator('.corner button[lang="ru"]').click();
  await page.getByRole('button', { name: /Тренировка/ }).waitFor({ timeout: 10000 });
  check(await page.evaluate(() => document.documentElement.lang === 'ru' && localStorage.getItem('blatkom89.lang.v1') === 'ru'), 'the menu switches to Russian and remembers it');
  await page.screenshot({ path: `${outDir}/demo_menu_ru.png` });
  await page.locator('.corner button[lang="en"]').click();
  await page.getByRole('button', { name: /Practice/ }).waitFor({ timeout: 10000 });
  await page.reload();
  await page.getByTestId('menu-nick').filter({ hasText: NICK }).waitFor({ timeout: 60000 });
  const dialogAgain = await page.getByRole('textbox', { name: 'Alias' }).count();
  check(dialogAgain === 0, 'after a reload the profile is kept and no nickname dialog appears');
  // settings → «Reset local profile» forgets it and the first-launch dialog comes back
  await page.getByRole('button', { name: 'Settings' }).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset local profile' }).click();
  await page.getByRole('textbox', { name: 'Alias' }).waitFor({ timeout: 10000 });
  const stored = await page.evaluate(() => localStorage.getItem('blatkom89.local-profile.v1'));
  check(stored === null, 'settings can reset the browser-only profile (nickname dialog shown again)');
} catch (e) {
  problems.push(`[test] ${e.message}`);
  await page.screenshot({ path: `${outDir}/demo_fail.png` }).catch(() => {});
}
await browser.close();
if (problems.length) console.log(problems.slice(0, 10).join('\n'));
const ok = checks.length >= 12 && checks.every((c) => c.ok) && !problems.some((p) => p.startsWith('[pageerror]') || p.startsWith('[test]'));
console.log(ok ? '[demo] passed' : '[demo] FAILED');
process.exit(ok ? 0 : 1);
