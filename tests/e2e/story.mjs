// The story mode end to end (v0.2.13, part 4a): A (English, desktop) and B (Russian, phone).
// A: the menu's «Story» button; the first visit plays the prologue by itself (2089 in neon over the
// BLATKOM hall), «Skip»; the soundtrack very quietly behind every comic, off in the mission
// ends it; the hub — two campaigns of five missions in chapter 1, chapter 4 on the way, the first
// mission open and the rest locked, the card index empty; mission 1 of «My Yard»: the campaign's
// opening and the mission's comic over the yard's big picture, then the mission — the objective line counts the loafers, the
// characters' lines pop up; everybody down (after the server's shortest time) — the comic after it, the
// rewards (+60 talons, +40 XP) also in the database, the next mission offered; the hub: mission 1 done
// with its best time, mission 2 open, Karlych in the card index. Then mission 1 again: three hearts on the
// objective line, the hero dropped three times (a heart each, back after each fall) — «Mission failed»
// with the narrator's line, «Again» goes straight into the mission, the pause menu's
// «Back to the story» leaves it, and «← Back» from the hub is the menu; «The Report» opens its comic over
// the department store's big picture (the speaker's portrait and bubble along the bottom). B: the phone menu — «Сюжет» beside «Быстрый матч», friends, Kon and
// practice in a row, one screen; the hub and the comic upright without sideways scroll, and the big picture
// behind «The Report»'s comic on the phone.
//
// Usage: DATABASE_URL=… node tests/e2e/story.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/story.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 5);

async function player(name, lang, viewport) {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + '/');
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  return { name, ctx, page };
}
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
/** Turns every page of the comic on screen; returns how many there were. */
async function readComic(page) {
  await page.getByTestId('comic').waitFor({ timeout: 15000 });
  let n = 0;
  while ((await page.getByTestId('comic').count()) > 0 && n < 40) {
    await page.keyboard.press('Enter');
    n++;
    await page.waitForTimeout(120);
  }
  return n;
}
/** The mission's world as the page has it. */
const world = (page, fn, arg) => page.evaluate(([src, a]) => new Function('s', 'w', 'a', src)(window.__blatkom.app.session, window.__blatkom.app.session?.world, a), [fn, arg]);

try {
  // ── A: the menu, the prologue, the hub ────────────────────────────────────
  const A = await player('Storyteller', 'en', { width: 1280, height: 760 });
  const me = await A.page.evaluate(() => window.__blatkom?.app?.online?.profile?.id ?? null);
  check(await A.page.getByTestId('menu-story').isVisible(), 'the menu has «Story»');
  await A.page.screenshot({ path: `${outDir}/story_menu_desktop.png` });
  await A.page.getByTestId('menu-story').click();
  await A.page.getByTestId('comic').waitFor({ timeout: 20000 });
  const neon = await A.page.evaluate(() => document.querySelector('[data-testid=comic]')?.classList.contains('comic--neon') && document.querySelector('[data-testid=comic-scene]')?.getAttribute('data-scene') === 'hall2089');
  check(neon && /2089/.test(await text(A.page, '[data-testid=comic-panel]')), `the first visit plays the prologue by itself, 2089 in neon over the BLATKOM hall («${(await text(A.page, '[data-testid=comic-panel]')).slice(0, 50)}…»)`);
  await A.page.screenshot({ path: `${outDir}/story_prologue.png` });
  await A.page.keyboard.press('Enter');
  await A.page.keyboard.press('Enter');
  await A.page.getByTestId('comic-skip').click();
  check((await A.page.getByTestId('comic').count()) === 0, '«Skip» ends the prologue');
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  const hub = await A.page.evaluate(() => ({
    campaigns: document.querySelectorAll('[data-testid^=story-campaign-]').length,
    missions: [...document.querySelectorAll('.smission')].map((e) => `${e.getAttribute('data-testid').replace('story-mission-', '')}:${e.getAttribute('data-state')}`),
    soon: document.querySelectorAll('.scamp__chapters button.soon').length,
    cards: document.querySelector('[data-testid=story-cards]')?.textContent,
  }));
  check(hub.campaigns === 2 && hub.missions.length === 10 && hub.missions.filter((m) => m.endsWith(':open')).length === 2 && hub.missions.includes('a1:open') && hub.missions.includes('a2:locked') && hub.soon === 2, `the hub: two campaigns, chapter 1 with 5 missions each, the first open, chapter 4 on the way (${JSON.stringify(hub)})`);
  check(/0\/22/.test(hub.cards ?? ''), `the card index is empty (${hub.cards})`);
  await A.page.screenshot({ path: `${outDir}/story_hub_desktop.png`, fullPage: true });
  await A.page.reload();
  await A.page.getByTestId('menu-story').waitFor({ timeout: 60000 });
  await A.page.getByTestId('menu-story').click();
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  await A.page.waitForTimeout(800);
  check((await A.page.getByTestId('comic').count()) === 0, 'the prologue plays by itself only once');

  // ── A: mission 1 ─────────────────────────────────────────────────────────
  await A.page.getByTestId('story-play-a1').click();
  await A.page.getByTestId('comic').waitFor({ timeout: 15000 });
  const firstPanel = await text(A.page, '[data-testid=comic-panel]');
  const yardScene = await A.page.evaluate(() => document.querySelector('[data-testid=comic]')?.classList.contains('comic--scene') && document.querySelector('[data-testid=comic-scene]')?.getAttribute('data-scene'));
  const comicMusic = await A.page.evaluate(() => window.__blatkom.music.state());
  await A.page.screenshot({ path: `${outDir}/story_comic_a1.png` });
  const pages = await readComic(A.page);
  check(pages === 7 && /3rd Microdistrict/.test(firstPanel), `the campaign's opening and the mission's comic: ${pages} pages, the first «${firstPanel.slice(0, 40)}…»`);
  check(yardScene === 'yard', `«My Yard» opens over the yard's big picture (${yardScene})`);
  check(comicMusic.wanted && comicMusic.quiet && comicMusic.target <= 0.22, `the soundtrack very quietly behind the comic (${JSON.stringify(comicMusic)})`);
  await A.page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
  check(/Free the bench: loafers 3/.test(await text(A.page, '[data-testid=story-goal]')), `the objective line: «${await text(A.page, '[data-testid=story-goal]')}»`);
  const missionMusic = await A.page.evaluate(() => window.__blatkom.music.state());
  check(!missionMusic.wanted && !missionMusic.quiet, `the soundtrack fades out with the mission (${JSON.stringify(missionMusic)})`);
  await A.page.getByTestId('story-bark').first().waitFor({ timeout: 15000 });
  check(/No unauthorised persons/.test(await text(A.page, '[data-testid=story-bark]')), `the hero says his line at the start («${await text(A.page, '[data-testid=story-bark]')}»)`);
  await A.page.screenshot({ path: `${outDir}/story_mission_a1.png` });
  // the hero can't be dropped while the test waits out the server's shortest mission time
  await world(A.page, 'w.players.get("local").invulnUntil = 1e12;');
  const before = await world(A.page, 'return [...w.players.values()].filter((p) => p.team === 1).map((p) => p.name + ":" + p.character);');
  check(before.length === 3 && before.every((p) => p.startsWith('Loafer:')), `three loafers stand on the other side (${before.join(', ')})`);
  await world(A.page, 'const e = [...w.players.values()].find((p) => p.team === 1 && p.alive); e.invulnUntil = 0; w.applyDamage(e, w.players.get("local"), 999, "pistol");');
  await A.page.waitForFunction(() => /loafers 2/.test(document.querySelector('[data-testid=story-goal]')?.textContent ?? ''), null, { timeout: 10000 });
  check(true, 'one down: the line counts 2');
  await A.page.waitForFunction(() => (window.__blatkom.app.session?.elapsedMs?.() ?? 0) > 13500, null, { timeout: 60000 });
  await world(A.page, 'for (const e of [...w.players.values()].filter((p) => p.team === 1 && p.alive)) { e.invulnUntil = 0; w.applyDamage(e, w.players.get("local"), 999, "pistol"); }');
  await A.page.getByTestId('comic').waitFor({ timeout: 20000 });
  check(/Karlych/.test(await text(A.page, '[data-testid=comic-panel]')), `the comic after the mission (${(await text(A.page, '[data-testid=comic-panel]')).slice(0, 50)}…)`);
  await readComic(A.page);
  await A.page.getByTestId('story-win').waitFor({ timeout: 20000 });
  await A.page.getByTestId('story-rewards').waitFor({ timeout: 20000 });
  const rewards = await text(A.page, '[data-testid=story-rewards]');
  check(/\+60 talons/.test(rewards) && /\+40 XP/.test(rewards), `the rewards: ${rewards}`);
  const endMusic = await A.page.evaluate(() => window.__blatkom.music.state());
  check(endMusic.wanted && !endMusic.quiet, `after the comic the soundtrack is back at the menu level (${JSON.stringify(endMusic)})`);
  check(/Next: The Queue/i.test(await text(A.page, '[data-testid=story-next]')), 'the next mission is offered');
  await A.page.screenshot({ path: `${outDir}/story_win.png` });
  const [row] = await sql`SELECT best_ms, completions FROM story_progress WHERE user_id = ${me} AND mission_id = 'a1'`;
  const [led] = await sql`SELECT delta FROM currency_ledger WHERE user_id = ${me} AND reason = 'story' AND ref = 'story:a1'`;
  check(row?.completions === 1 && row.best_ms >= 13500 && led?.delta === 60, `the database: mission a1 done once (${row?.best_ms} ms), 60 talons in the ledger`);
  await A.page.getByTestId('story-hub').click();
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  const after = await A.page.evaluate(() => ({ a1: document.querySelector('[data-testid=story-mission-a1]')?.getAttribute('data-state'), a2: document.querySelector('[data-testid=story-mission-a2]')?.getAttribute('data-state'), best: document.querySelector('[data-testid=story-mission-a1] .smission__reward')?.textContent, cards: document.querySelector('[data-testid=story-cards]')?.textContent, progress: document.querySelector('[data-testid=story-progress-petya]')?.textContent }));
  check(after.a1 === 'done' && after.a2 === 'open' && /Best time 0:1\d/.test(after.best ?? '') && /1\/22/.test(after.cards ?? '') && /^1\/12/.test(after.progress ?? ''), `the hub: mission 1 done, mission 2 open (${JSON.stringify(after)})`);
  await A.page.getByTestId('story-cards').click();
  await A.page.getByTestId('story-cardgrid').waitFor({ timeout: 10000 });
  const met = await A.page.evaluate(() => [...document.querySelectorAll('[data-met=true]')].map((e) => e.getAttribute('data-testid')));
  check(met.length === 1 && met[0] === 'story-card-vorona', `the card index: Karlych met (${met.join(', ')})`);
  await A.page.screenshot({ path: `${outDir}/story_cards.png` });
  await A.page.keyboard.press('Escape');

  // ── A: mission 1 again — dropped, «Again», back to the story ──────────────
  await A.page.getByTestId('story-play-a1').click();
  await A.page.getByTestId('comic-skip').click();
  await A.page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
  check((await text(A.page, '[data-testid=story-lives]')) === '♥♥♥', `three lives on the objective line («${await text(A.page, '[data-testid=story-lives]')}»)`);
  const dropHero = 'const h = w.players.get("local"); h.invulnUntil = 0; w.applyDamage(h, [...w.players.values()].find((p) => p.team === 1), 999, "pistol");';
  for (let fall = 1; fall <= 2; fall++) {
    await A.page.waitForFunction(() => window.__blatkom.app.session?.world?.players.get('local')?.alive === true, null, { timeout: 20000 });
    await world(A.page, dropHero);
    await A.page.waitForFunction((n) => document.querySelector('[data-testid=story-lives]')?.textContent === '♥'.repeat(3 - n) + '♡'.repeat(n), fall, { timeout: 10000 });
  }
  check(true, 'two falls: two hearts lost, the hero back each time, the mission goes on');
  await A.page.waitForFunction(() => window.__blatkom.app.session?.world?.players.get('local')?.alive === true, null, { timeout: 20000 });
  await world(A.page, dropHero);
  await A.page.getByTestId('story-fail').waitFor({ timeout: 20000 });
  const fail = await text(A.page, '[data-testid=story-fail]');
  check(/Mission failed/i.test(fail) && /headache/.test(fail), `dropped: «${fail.slice(0, 90)}…»`);
  await A.page.screenshot({ path: `${outDir}/story_fail.png` });
  await A.page.getByTestId('story-retry').click();
  await A.page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
  check((await A.page.getByTestId('comic').count()) === 0, '«Again» goes straight into the mission (no comic)');
  await A.page.keyboard.press('Escape');
  await A.page.getByRole('button', { name: 'Back to the story' }).click();
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  check((await A.page.getByTestId('story-overlay').count()) === 0, 'the pause menu’s «Back to the story» leaves the mission and its overlay');
  await A.page.locator('.topbar .back').click();
  await A.page.getByTestId('menu-story').waitFor({ timeout: 10000 });
  check(true, '«← Back» from the hub after the missions is the menu (not the hub again)');
  // «The Report» opens at the department store: its comic is the place's big picture
  await A.page.getByTestId('menu-story').click();
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  await A.page.getByTestId('story-play-b1').click();
  await A.page.getByTestId('comic-scene').waitFor({ timeout: 15000 });
  await A.page.waitForFunction(() => (document.querySelector('[data-testid=comic-scene]')?.naturalWidth ?? 0) > 0, null, { timeout: 15000 });
  const sceneA = await A.page.evaluate(() => {
    const img = document.querySelector('[data-testid=comic-scene]');
    const r = img.getBoundingClientRect();
    return { scene: img.getAttribute('data-scene'), w: img.naturalWidth, covers: r.left <= 1 && r.top <= 1 && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1, mode: document.querySelector('[data-testid=comic]').classList.contains('comic--scene') };
  });
  check(sceneA.scene === 'univermag' && sceneA.w === 1600 && sceneA.covers && sceneA.mode, `«The Report», mission 1: the comic over the department store's big picture (${JSON.stringify(sceneA)})`);
  for (let k = 0; k < 8 && !(await A.page.locator('[data-testid=comic-panel][data-who]').count()); k++) await A.page.keyboard.press('Enter');
  await A.page.waitForTimeout(400);
  const speakerA = await A.page.evaluate(() => {
    const art = document.querySelector('[data-testid=comic-panel] .comic__art')?.getBoundingClientRect();
    const bub = document.querySelector('[data-testid=comic-panel] .comic__bubble')?.getBoundingClientRect();
    return { beside: !!art && !!bub && Math.abs(art.bottom - bub.bottom) < 40 && (bub.left >= art.right - 2 || bub.right <= art.left + 2), low: !!bub && bub.top > innerHeight * 0.55 && bub.bottom <= innerHeight, scene: !!document.querySelector('[data-testid=comic-scene]') };
  });
  check(speakerA.beside && speakerA.low && speakerA.scene, `a speaker: the portrait beside the bubble along the bottom, the picture behind (${JSON.stringify(speakerA)})`);
  await A.page.screenshot({ path: `${outDir}/story_scene_desktop.png` });
  await A.page.getByTestId('comic-skip').click();
  await A.page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
  check((await A.page.getByTestId('loadscreen').count()) === 0, 'a story mission has no loading screen (its comic showed the place)');
  await A.page.keyboard.press('Escape');
  await A.page.getByRole('button', { name: 'Back to the story' }).click();
  await A.page.getByTestId('story').waitFor({ timeout: 15000 });
  const [again] = await sql`SELECT completions FROM story_progress WHERE user_id = ${me} AND mission_id = 'a1'`;
  check(again?.completions === 1, 'a lost or abandoned mission is not recorded');
  await A.ctx.close();

  // ── B: the phone ──────────────────────────────────────────────────────────
  const B = await player('Rasskazchik', 'ru', { width: 390, height: 844 });
  const menu = await B.page.evaluate(() => {
    const qm = document.querySelector('.menu__play > .btn--red')?.getBoundingClientRect();
    const st = document.querySelector('[data-testid=menu-story]')?.getBoundingClientRect();
    const row = [...document.querySelectorAll('.menu__play > .btn:not(.btn--red):not(.menu__story)')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.getBoundingClientRect());
    return { beside: !!qm && !!st && Math.abs(qm.top - st.top) < 2 && st.left > qm.right - 2, row: row.length === 3 && row.every((r) => Math.abs(r.top - row[0].top) < 2), label: document.querySelector('[data-testid=menu-story]')?.textContent?.trim(), over: document.scrollingElement.scrollHeight - innerHeight, side: document.scrollingElement.scrollWidth - innerWidth };
  });
  check(menu.beside && menu.row && menu.over <= 0 && menu.side <= 0 && /^Сюжет/.test(menu.label ?? ''), `B’s phone menu: «Сюжет» beside «Быстрый матч», three in the next row, one screen (${JSON.stringify(menu)})`);
  await B.page.screenshot({ path: `${outDir}/story_menu_phone.png` });
  await B.page.getByTestId('menu-story').click();
  await B.page.getByTestId('comic').waitFor({ timeout: 20000 });
  await B.page.keyboard.press('Enter');
  await B.page.keyboard.press('Enter');
  await B.page.keyboard.press('Enter');
  await B.page.keyboard.press('Enter');
  await B.page.waitForTimeout(300);
  const comicBox = await B.page.evaluate(() => {
    const art = document.querySelector('.comic__art')?.getBoundingClientRect();
    const bub = document.querySelector('.comic__bubble')?.getBoundingClientRect();
    const scene = document.querySelector('[data-testid=comic-scene]')?.getAttribute('data-scene') ?? null;
    return { art: !!art, scene, beside: !!art && !!bub && bub.left >= art.right - 2 && Math.abs(art.bottom - bub.bottom) < 40, inside: !!bub && !!art && bub.right <= innerWidth && art.left >= 0 && bub.bottom <= innerHeight, low: !!bub && bub.top > innerHeight * 0.6, side: document.scrollingElement.scrollWidth - innerWidth };
  });
  check(comicBox.art && comicBox.scene === 'hall2089' && comicBox.beside && comicBox.inside && comicBox.low && comicBox.side <= 0, `the prologue upright: 2089's hall on the whole screen, the portrait beside the bubble along the bottom (${JSON.stringify(comicBox)})`);
  await B.page.screenshot({ path: `${outDir}/story_comic_phone.png` });
  await B.page.getByTestId('comic-skip').click();
  await B.page.getByTestId('story').waitFor({ timeout: 15000 });
  const phoneHub = await B.page.evaluate(() => {
    const scr = document.querySelector('.screen');
    return { side: scr.scrollWidth - scr.clientWidth, title: document.querySelector('.topbar .h1')?.textContent, play: document.querySelector('[data-testid=story-play-b1]')?.textContent };
  });
  check(phoneHub.side <= 0 && phoneHub.title === 'Сюжет' && phoneHub.play === 'Играть', `B’s hub on the phone, in Russian, no sideways scroll (${JSON.stringify(phoneHub)})`);
  await B.page.screenshot({ path: `${outDir}/story_hub_phone.png`, fullPage: true });
  await B.page.getByTestId('story-play-b1').click();
  await B.page.getByTestId('comic-scene').waitFor({ timeout: 15000 });
  await B.page.waitForFunction(() => (document.querySelector('[data-testid=comic-scene]')?.naturalWidth ?? 0) > 0, null, { timeout: 15000 });
  for (let k = 0; k < 8 && !(await B.page.locator('[data-testid=comic-panel][data-who]').count()); k++) await B.page.keyboard.press('Enter');
  await B.page.waitForTimeout(500);
  const sceneB = await B.page.evaluate(() => {
    const img = document.querySelector('[data-testid=comic-scene]').getBoundingClientRect();
    const bub = document.querySelector('[data-testid=comic-panel] .comic__bubble')?.getBoundingClientRect();
    const art = document.querySelector('[data-testid=comic-panel] .comic__art')?.getBoundingClientRect();
    return { covers: img.left <= 1 && img.top <= 1 && img.right >= innerWidth - 1 && img.bottom >= innerHeight - 1, inside: !!bub && !!art && bub.left >= 0 && bub.right <= innerWidth && bub.bottom <= innerHeight && art.left >= 0, low: !!bub && bub.top > innerHeight * 0.6, side: document.scrollingElement.scrollWidth - innerWidth };
  });
  check(sceneB.covers && sceneB.inside && sceneB.low && sceneB.side <= 0, `the phone: the picture fills the screen, the portrait and bubble along the bottom (${JSON.stringify(sceneB)})`);
  await B.page.screenshot({ path: `${outDir}/story_scene_phone.png` });
  await B.ctx.close();
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
} catch (e) {
  console.error('[story] failed:', e);
  checks.push({ ok: false, what: `exception: ${e.message}` });
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `[story] ${bad.length} of ${checks.length} checks failed` : `[story] all ${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
