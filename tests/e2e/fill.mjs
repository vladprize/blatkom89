// Filled lineups (server started with MATCH_FILL_BOTS=true): one person can always play.
// A (English) creates a room with friends and starts it alone — the match runs with 4 players and the
// lobby, the match data and the results screen mark nobody; B (Russian) picks Quick Match alone —
// after a short wait players arrive one by one and the match starts by itself.
//
// Usage: node tests/e2e/fill.mjs <baseUrl> <outDir>
// The server should run with a short match (e.g. MATCH_DURATION_SEC=40).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/fill.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
// «bot», «bots», «бот», «боты», «ботов»… as words (not «работает»)
const MARKED = /\bbots?\b|(^|[^а-яё])бот(а|у|ом|е|ы|ов|ам|ами|ах)?(?![а-яё])/i;

// aliases are unique (v0.23): every run brings its own
const RUN = Math.random().toString(36).slice(2, 5);

async function player(name, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: lang === 'ru' ? 'ru-RU' : 'en-GB' });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
        // the account window of a guest (tested in online.mjs and social.mjs)
        localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  return { name, ctx, page };
}

const A = await player('A', 'en');
const B = await player('B', 'ru');
const fail = async (e) => {
  console.error('[fill] failed:', e.message);
  for (const p of [A, B]) {
    await p.page.screenshot({ path: `${outDir}/fill_fail_${p.name}.png` }).catch(() => {});
    const text = await p.page.evaluate(() => document.querySelector('#ui')?.innerText?.slice(0, 400) ?? '').catch(() => '');
    console.error(`[fill] ${p.name} screen:`, text.replace(/\s+/g, ' '));
  }
  console.error(problems.join('\n'));
  await browser.close().catch(() => {});
  process.exit(1);
};
process.on('uncaughtException', fail);

async function pressPlay(page) {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  const play = page.getByTestId('boot-play');
  if (await play.count()) await play.click();
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('boot--hidden'), null, { timeout: 10000 });
}

async function nickname(p, nick) {
  const input = p.page.getByRole('textbox', { name: /Alias|Кличка/ });
  await input.waitFor({ timeout: 60000 });
  await input.fill(nick);
  await p.page.getByRole('button', { name: /^(Done|Готово)$/ }).click();
  await p.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
}

const inMatch = (page) => page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
/** What the client knows about the others: the lobby roster and the match's player list. */
const lineup = (page) =>
  page.evaluate(() => {
    const lobby = window.__blatkom.app.lastLobby;
    const s = window.__blatkom.game.scene.getScene('game')?.session;
    return {
      roster: lobby.players.map((p) => ({ name: p.name, isBot: p.isBot, level: p.level, host: p.isHost })),
      inGame: s ? s.players().map((p) => ({ name: p.name, isBot: p.isBot })) : [],
    };
  });

try {
  // ── A: a room with friends, started alone ───────────────────────────────
  await A.page.goto(base + '/');
  await pressPlay(A.page);
  await nickname(A, `Lone Ranger ${RUN}`);
  await A.page.getByRole('button', { name: /Play with Friends/ }).click({ timeout: 30000 });
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  await A.page.locator('.code').waitFor({ timeout: 20000 });
  await A.page.getByText(/Players 1\//).waitFor({ timeout: 20000 });
  const start = A.page.getByTestId('lobby-start');
  check(!(await start.isDisabled()), `alone in the room, the host can start («${(await start.innerText()).trim()}»)`);
  const noteA = (await A.page.getByTestId('lobby-note').innerText()).trim();
  check(/more players join at kick-off/.test(noteA), `the lobby says more players join at kick-off («${noteA}»)`);
  await A.page.screenshot({ path: `${outDir}/fill_lobby_A.png` });
  await start.click();
  await inMatch(A.page);
  await A.page.waitForTimeout(2500);
  const la = await lineup(A.page);
  check(la.roster.length === 4 && la.inGame.length === 4, `the match runs with 4 players (${la.roster.map((p) => p.name).join(', ')})`);
  check([...la.roster, ...la.inGame].every((p) => p.isBot === false) && !la.roster.some((p) => MARKED.test(p.name)), 'nobody is marked in the roster or the match');
  check(la.roster.filter((p) => p.host).length === 1 && la.roster.find((p) => p.host)?.name === `Lone Ranger ${RUN}`, 'the person who made the room is its only host');
  await A.page.screenshot({ path: `${outDir}/fill_match_A.png` });
  await A.page.keyboard.down('Tab');
  await A.page.waitForTimeout(400);
  await A.page.screenshot({ path: `${outDir}/fill_scoreboard_A.png` });
  await A.page.keyboard.up('Tab');

  // ── B: Quick Match alone ────────────────────────────────────────────────
  await B.page.goto(base + '/');
  await pressPlay(B.page);
  await nickname(B, `Одиночка ${RUN}`);
  await B.page.getByRole('button', { name: /Быстрый матч/ }).click({ timeout: 30000 });
  await B.page.locator('.quickmode[data-mode="ffa"]').click();
  await B.page.getByText(/Игроки 1\//).waitFor({ timeout: 30000 });
  const noteB = (await B.page.getByTestId('lobby-note').innerText()).trim();
  check(/Собираем игроков/.test(noteB), `Quick Match lobby: «${noteB}»`);
  await B.page.screenshot({ path: `${outDir}/fill_quick_lobby_B.png` });
  const t0 = Date.now();
  const sizes = [];
  let marked = false;
  let shot = false;
  for (;;) {
    const st = await B.page.evaluate(() => ({
      n: window.__blatkom.app.lastLobby?.players.length ?? 0,
      active: window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active',
      text: document.querySelector('#ui')?.innerText ?? '',
    }));
    if (MARKED.test(st.text)) marked = true;
    if (sizes[sizes.length - 1] !== st.n) sizes.push(st.n);
    if (st.active) break;
    if (Date.now() - t0 > 30000) throw new Error(`Quick Match did not start (lineup ${sizes.join('→')})`);
    if (st.n >= 2 && !shot) {
      shot = true;
      await B.page.screenshot({ path: `${outDir}/fill_quick_arrivals_B.png` }).catch(() => {});
    }
    await B.page.waitForTimeout(250);
  }
  const waited = Date.now() - t0;
  check(waited < 18000, `Quick Match alone: the match started by itself after ${(waited / 1000).toFixed(1)} s`);
  check(sizes.length >= 3 && sizes[0] === 1, `players arrived one by one (${sizes.join(' → ')})`);
  check(!marked, 'nothing on the Quick Match screens marks anyone');
  await B.page.waitForTimeout(2000);
  const lb = await lineup(B.page);
  check(lb.inGame.length === 4 && lb.inGame.every((p) => p.isBot === false) && lb.roster.every((p) => p.isBot === false), `B's match: 4 players, nobody marked (${lb.roster.map((p) => p.name).join(', ')})`);
  await B.page.screenshot({ path: `${outDir}/fill_quick_match_B.png` });

  // ── A: the results ──────────────────────────────────────────────────────
  await A.page.getByText('Match report').waitFor({ timeout: 90000 });
  const rows = await A.page.locator('table.table tbody tr').count();
  const resultsText = await A.page.locator('#ui').innerText();
  check(rows === 4, `results list the whole lineup (${rows} rows)`);
  check(!MARKED.test(resultsText), 'the results screen marks nobody');
  await A.page.screenshot({ path: `${outDir}/fill_results_A.png`, fullPage: true });
} catch (e) {
  await fail(e);
}
await browser.close();
const bad = problems.filter((p) => /pageerror/.test(p));
if (problems.length) console.log(problems.slice(0, 10).join('\n'));
const ok = checks.length >= 12 && checks.every((c) => c.ok) && bad.length === 0;
console.log(ok ? '[fill] passed' : '[fill] FAILED');
process.exit(ok ? 0 : 1);
