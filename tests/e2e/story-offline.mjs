// The story in the single-file build opened from disk with the network off (v0.2.13).
//  1. A browser that keeps storage (Chrome, Firefox): the menu's «Story» is the main (red) button; the
//     prologue plays by itself; the hub says the progress stays in this browser and promises experience
//     only (no talons without a server); mission 1 — the comic, the objective line with three hearts,
//     everybody down — the comic after it and «+40 XP» in the local profile, written to the storage;
//     after a reload mission 1 is done, mission 2 open and the prologue doesn't play again; with chapter 1
//     of «The Report» done the hub opens chapter 2, whose first mission — its comic over the square's big
//     picture, carried inside the file — plays and pays. The open end (v0.2.15): with «My Yard» done up to
//     chapter 3 the hub opens chapter 3 (chapter 4 «coming soon»), its last mission «The Foundation Pit»
//     plays over the building site, its comic looks in on 2089 and ends with «To be continued» over the
//     yard, the chapter's achievement comes, the end screen says chapter 4 comes in an update.
//  2. A browser that refuses storage to a file from disk (Safari does — «SecurityError: The operation is
//     insecure»): the game still starts, the hub warns that the progress lasts until the tab closes, and
//     within the session the story moves on — mission 1 done opens mission 2, the prologue doesn't come back.
// No page errors, nothing fetched from the network.
//
// Usage: node tests/e2e/story-offline.mjs <path to blatkom89-demo.html> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node tests/e2e/story-offline.mjs <blatkom89-demo.html> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const url = pathToFileURL(file).href;
const booted = (page) =>
  page.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 120000 });
const open = async (page) => {
  await booted(page);
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
};
/** A context offline, page errors and any request off the disk collected into `problems`. */
const offlinePage = async (init) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU', offline: true });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[console] ${m.text()}`);
  });
  page.on('request', (r) => {
    if (!/^(file|data|blob):/.test(r.url())) problems.push(`[network] ${r.url()}`);
  });
  return { ctx, page, problems };
};
const firstLaunch = async (page) => {
  await page.goto(url);
  await open(page);
  const nick = page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill('Pilot');
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByTestId('menu-story').waitFor({ timeout: 30000 });
};
const readComic = async (page) => {
  let n = 0;
  while ((await page.getByTestId('comic').count()) > 0 && n < 40) {
    await page.keyboard.press('Enter');
    n++;
    await page.waitForTimeout(120);
  }
  return n;
};
/** Reads a comic to its end, page by page: the picture behind it, the words, 2089 or not. */
const comicPages = async (page) => {
  const pages = [];
  for (let n = 0; n < 40 && (await page.getByTestId('comic').count()) > 0; n++) {
    pages.push(
      await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('[data-testid=comic-scene]:not(.comic__scene--out)')];
        const panels = [...document.querySelectorAll('[data-testid=comic-panel]')];
        return { scene: imgs[imgs.length - 1]?.getAttribute('data-scene') ?? null, text: panels[panels.length - 1]?.textContent ?? '', neon: !!document.querySelector('.comic--neon') };
      }),
    );
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
  return pages;
};
/** Wins the mission on screen: everybody down (team missions: the limit first). */
const winMission = async (page) => {
  for (let k = 0; k < 8; k++) {
    const done = await page.evaluate(() => {
      const s = window.__blatkom.app.session;
      // the mission already over and handed back to the story (its outro comic): done
      if (!s?.world) return true;
      if (s.outcome()) return true;
      const w = s.world;
      const hero = w.players.get('local');
      hero.invulnUntil = 1e12;
      if (s.mission.objective.kind === 'team') w.teamScore[0] = s.mission.objective.limit - 1;
      // «hold the spots»: the side's points at the limit — the next base tick ends it
      if (s.mission.objective.kind === 'bases') w.teamScore[0] = s.mission.objective.limit;
      for (const e of [...w.players.values()].filter((p) => p.team === 1 && p.alive)) {
        e.invulnUntil = 0;
        w.applyDamage(e, hero, 999, 'pistol');
      }
      return !!s.outcome();
    });
    if (done) return;
    await page.waitForTimeout(2200);
  }
};
/** Mission 1 from the hub to its rewards; returns the rewards line and the local profile's experience. */
const playA1 = async (page, shot) => {
  await page.getByTestId('story-play-a1').click();
  const pages = await readComic(page);
  await page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
  const goal = await page.getByTestId('story-goal').innerText();
  if (shot) await page.screenshot({ path: `${outDir}/${shot}` });
  await winMission(page);
  await page.getByTestId('comic').waitFor({ timeout: 20000 });
  await readComic(page);
  await page.getByTestId('story-rewards').waitFor({ timeout: 20000 });
  return { pages, goal, rewards: (await page.getByTestId('story-rewards').innerText()).trim(), xp: await page.evaluate(() => window.__blatkom.app.localProfile?.xp) };
};
const hubState = (page) =>
  page.evaluate(() => ({
    a1: document.querySelector('[data-testid=story-mission-a1]')?.getAttribute('data-state'),
    a2: document.querySelector('[data-testid=story-mission-a2]')?.getAttribute('data-state'),
    comic: !!document.querySelector('[data-testid=comic]'),
  }));
const failure = async (page, name) => {
  try {
    await page.screenshot({ path: `${outDir}/${name}` });
  } catch {}
};

// ── 1. a browser that keeps storage ──────────────────────────────────────────────────────────────
{
  const { ctx, page, problems } = await offlinePage(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  });
  try {
    await firstLaunch(page);
    check(await page.evaluate(() => document.querySelector('[data-testid=menu-story]')?.classList.contains('btn--red')), 'offline the menu’s «Сюжет» is the main (red) button');
    await page.getByTestId('menu-story').click();
    await page.getByTestId('comic').waitFor({ timeout: 20000 });
    check(/2089/.test(await page.getByTestId('comic-panel').innerText()), 'the prologue plays by itself');
    await page.getByTestId('comic-skip').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    const hub = await page.evaluate(() => ({ note: document.querySelector('.story__offline')?.textContent, warn: !!document.querySelector('[data-testid=story-unsaved]'), a1: document.querySelector('[data-testid=story-mission-a1] .smission__reward')?.textContent }));
    check(/этом браузере/.test(hub.note ?? '') && !hub.warn && hub.a1 === 'Впервые: +40 XP', `the hub: progress in this browser, experience only (${JSON.stringify(hub)})`);
    const a1 = await playA1(page, 'offline_a1.png');
    check(a1.pages === 7, `the campaign’s opening and the mission’s comic: ${a1.pages} pages`);
    check(/тунеядцы 3/.test(a1.goal) && /♥♥♥/.test(a1.goal), `the objective line: «${a1.goal}»`);
    check(a1.rewards === '+40 XP' && a1.xp === 40, `the rewards: «${a1.rewards}», the local profile has ${a1.xp} XP`);
    await page.getByTestId('story-hub').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    const snap = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))));
    const stored = JSON.parse(snap);
    check(/"id":"a1"/.test(stored['blatkom89.story.local.v1'] ?? '') && JSON.parse(stored['blatkom89.local-profile.v1'] ?? '{}').xp === 40 && stored['blatkom89.story.prologue.v1'] === '1', 'the progress, the profile and «prologue seen» are written to this browser’s storage');
    await page.reload();
    if (!(await page.evaluate(() => localStorage.getItem('blatkom89.story.local.v1')))) {
      // headless Chromium now and then hands a reloaded file:// page an empty storage (seen in about one
      // load in ten with a bare test page too); what is checked here is that the game reads back what it wrote
      console.log('[story-offline] note: Chromium dropped the file:// storage on reload — restoring what the game had written');
      await page.evaluate((s) => {
        for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, v);
      }, snap);
      await page.reload();
    }
    await open(page);
    await page.getByTestId('menu-story').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    const after = await hubState(page);
    check(after.a1 === 'done' && after.a2 === 'open' && !after.comic, `after a reload: mission 1 done, mission 2 open, no prologue again (${JSON.stringify(after)})`);
    // chapter 1 of «The Report» done in this browser: the hub opens chapter 2
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('blatkom89.story.local.v1'));
      for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) raw.done.push({ id, at: new Date().toISOString(), bestMs: 60000, completions: 1 });
      localStorage.setItem('blatkom89.story.local.v1', JSON.stringify(raw));
    });
    await page.locator('.topbar .back').click();
    await page.getByTestId('menu-story').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const ch2 = await page.evaluate(() => ({ tab: document.querySelector('[data-testid=story-campaign-uchastkovy] .scamp__chapters [aria-pressed=true] b')?.textContent, b6: document.querySelector('[data-testid=story-mission-b6]')?.getAttribute('data-state') }));
    check(ch2.tab === '2' && ch2.b6 === 'open', `«The Report» opens on chapter 2 with «Толкучка» open (${JSON.stringify(ch2)})`);
    const banners = await page.evaluate(() => ['b6', 'b7', 'b8', 'b9'].map((id) => document.querySelector(`[data-testid=story-mission-${id}]`)?.getAttribute('data-scene') ?? '-').join(','));
    check(banners === 'square,hospital,factory,cemetery', `the hub: every mission's row is a little banner of its place (${banners})`);
    await page.getByTestId('story-play-b6').click();
    // the flea market by the square: its comic over the square's big picture, from inside the file
    await page.getByTestId('comic-scene').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('[data-testid=comic-scene]')?.naturalWidth ?? 0) > 0, null, { timeout: 15000 });
    const sq = await page.evaluate(() => {
      const img = document.querySelector('[data-testid=comic-scene]');
      return { scene: img.getAttribute('data-scene'), w: img.naturalWidth, inline: img.getAttribute('src').startsWith('data:image/jpeg') };
    });
    check(sq.scene === 'square' && sq.w === 1600 && sq.inline, `«Толкучка»: the comic over the square's big picture, inside the file (${JSON.stringify(sq)})`);
    await page.screenshot({ path: `${outDir}/offline_b6_scene.png` });
    await page.getByTestId('comic-skip').click();
    await page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
    check(/Закрой лотки: осталось 5/.test(await page.getByTestId('story-goal').innerText()), 'chapter 2’s first mission plays');
    await winMission(page);
    await page.getByTestId('comic').waitFor({ timeout: 20000 });
    await readComic(page);
    await page.getByTestId('story-rewards').waitFor({ timeout: 20000 });
    check((await page.getByTestId('story-rewards').innerText()).trim() === '+70 XP', 'and pays its experience');
    check((await page.getByTestId('story-end-scene').getAttribute('data-testid')) && (await page.evaluate(() => document.querySelector('[data-testid=story-end-scene]')?.getAttribute('src')?.startsWith('data:image/jpeg'))), 'the end of the mission over the square’s picture');
    await page.screenshot({ path: `${outDir}/offline_b6_win.png` });
    // the open end (v0.2.15): «My Yard» done up to its last mission so far
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('blatkom89.story.local.v1'));
      const have = new Set(raw.done.map((d) => d.id));
      for (let n = 1; n <= 11; n++) if (!have.has(`a${n}`)) raw.done.push({ id: `a${n}`, at: new Date().toISOString(), bestMs: 60000, completions: 1 });
      localStorage.setItem('blatkom89.story.local.v1', JSON.stringify(raw));
    });
    await page.getByTestId('story-hub').click();
    await page.locator('.topbar .back').click();
    await page.getByTestId('menu-story').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const ch3 = await page.evaluate(() => {
      const c = document.querySelector('[data-testid=story-campaign-petya]');
      return {
        tab: c?.querySelector('.scamp__chapters [aria-pressed=true] b')?.textContent,
        soon: [...(c?.querySelectorAll('.scamp__chapters button.soon b') ?? [])].map((b) => b.textContent).join(','),
        a11: document.querySelector('[data-testid=story-mission-a11]')?.getAttribute('data-state'),
        a12: document.querySelector('[data-testid=story-mission-a12]')?.getAttribute('data-state'),
        scene: document.querySelector('[data-testid=story-mission-a12]')?.getAttribute('data-scene'),
        progress: document.querySelector('[data-testid=story-progress-petya] b')?.textContent,
      };
    });
    check(ch3.tab === '3' && ch3.soon === '4' && ch3.a11 === 'done' && ch3.a12 === 'open' && ch3.scene === 'stroyka' && ch3.progress === '11/12', `«Мой двор» opens on chapter 3 — «Котлован» open over the building site, chapter 4 coming soon (${JSON.stringify(ch3)})`);
    await page.screenshot({ path: `${outDir}/offline_ch3_hub.png` });
    await page.getByTestId('story-play-a12').click();
    await page.getByTestId('comic').waitFor({ timeout: 15000 });
    const intro = await comicPages(page);
    check(intro.length >= 5 && intro[0].scene === 'stroyka' && /Объект 900/.test(intro[0].text), `«Котлован»: the comic over the building site's picture (${intro.length} pages: ${intro.map((p) => p.scene).join(',')})`);
    await page.getByTestId('story-goal').waitFor({ state: 'visible', timeout: 30000 });
    check(/Останови стройку: \d+ из 100 очков/.test(await page.getByTestId('story-goal').innerText()), 'its objective: hold the points');
    await winMission(page);
    await page.getByTestId('comic').waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const outro = await comicPages(page);
    const last = outro[outro.length - 1] ?? {};
    const in2089 = outro.find((p) => p.neon);
    check(in2089?.scene === 'hall2089' && /Дело отложено/.test(in2089.text), `the comic after it looks in on 2089: «${in2089?.text ?? ''}»`);
    check(last.scene === 'yard' && !last.neon && /^Продолжение следует\./.test(last.text), `and ends with «to be continued» over the yard («${last.text}», ${last.scene})`);
    await page.getByTestId('story-rewards').waitFor({ timeout: 20000 });
    const rew = (await page.getByTestId('story-rewards').innerText()).trim();
    check(/\+\d+ XP/.test(rew) && /Ночная смена/.test(rew), `the chapter's achievement comes with it («${rew.replace(/\s+/g, ' ')}»)`);
    const cont = await page.getByTestId('story-continued').innerText().catch(() => '');
    check(/Продолжение следует: глава 4 выйдет в одном из следующих обновлений/.test(cont) && (await page.getByTestId('story-next').count()) === 0, `the end screen: no next mission, chapter 4 comes in an update («${cont}»)`);
    await page.screenshot({ path: `${outDir}/offline_open_end.png` });
    check(problems.length === 0, `no page errors, nothing from the network (${problems.join(' | ')})`);
  } catch (e) {
    console.error('[story-offline] failed:', e);
    await failure(page, 'failure_storage.png');
    checks.push({ ok: false, what: `exception: ${e.message}` });
  }
  await ctx.close();
}

// ── 2. a browser that refuses storage to a file from disk (Safari) ────────────────────────────────
{
  const { ctx, page, problems } = await offlinePage(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  try {
    await firstLaunch(page);
    check(true, 'storage refused: the game starts and takes an alias');
    await page.getByTestId('menu-story').click();
    await page.getByTestId('comic').waitFor({ timeout: 20000 });
    await page.getByTestId('comic-skip').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    const warn = await page.getByTestId('story-unsaved').innerText().catch(() => '');
    check(/пока открыта вкладка/.test(warn) && /Chrome или Firefox/.test(warn), `the hub warns the progress lasts until the tab closes («${warn}»)`);
    await page.screenshot({ path: `${outDir}/offline_unsaved_hub.png` });
    const a1 = await playA1(page);
    check(a1.rewards === '+40 XP' && a1.xp === 40, `mission 1 pays in the session: «${a1.rewards}», ${a1.xp} XP`);
    await page.getByTestId('story-hub').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const hub = await hubState(page);
    check(hub.a1 === 'done' && hub.a2 === 'open', `the story moves on: mission 1 done, mission 2 open (${JSON.stringify(hub)})`);
    // «← Back» from the hub after a mission is the menu (not the hub again)
    await page.locator('.topbar .back').click();
    await page.getByTestId('menu-story').waitFor({ timeout: 10000 });
    check(true, '«← Back» from the hub after a mission goes to the menu');
    await page.getByTestId('menu-story').click();
    await page.getByTestId('story').waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    const again = await hubState(page);
    check(again.a1 === 'done' && again.a2 === 'open' && !again.comic, `back in the hub: still there, no prologue again (${JSON.stringify(again)})`);
    check(problems.length === 0, `no page errors, nothing from the network (${problems.join(' | ')})`);
  } catch (e) {
    console.error('[story-offline] failed (storage refused):', e);
    await failure(page, 'failure_refused.png');
    checks.push({ ok: false, what: `exception: ${e.message}` });
  }
  await ctx.close();
}

await browser.close();
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `[story-offline] ${bad.length} of ${checks.length} checks failed` : `[story-offline] all ${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
