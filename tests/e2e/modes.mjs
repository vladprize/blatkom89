// Online game modes, two independent browsers (one of them in Russian): A creates a capture-the-flag
// room, B joins by invite; both lobbies show the red and blue columns; the host flips the mode to
// base capture and back (B sees it, teams stay); the match runs with flags in the HUD for both players
// and ends with a team result and a Flags column; then both pick «Base Capture» in Quick Match and
// land in the same public room.
//
// Usage: node tests/e2e/modes.mjs <baseUrl> <outDir>
// The server should run with a short match (e.g. MATCH_DURATION_SEC=40).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/modes.mjs <baseUrl> <outDir>');
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

// aliases are unique (v0.23): every run brings its own
const RUN = Math.random().toString(36).slice(2, 5);

async function player(name, character, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: lang === 'ru' ? 'ru-RU' : 'en-GB' });
  await ctx.addInitScript(
    ([c, l]) => {
      try {
        localStorage.setItem('blatkom89.character', c);
        localStorage.setItem('blatkom89.lang.v1', l);
        localStorage.setItem('blatkom89.tutorial.v1', '1');
        // the account window of a guest (tested in online.mjs and social.mjs)
        localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      } catch {}
    },
    [character, lang],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  return { name, ctx, page };
}

const A = await player('A', 'petya', 'en');
const B = await player('B', 'valuta', 'ru');
const fail = async (e) => {
  console.error('[modes] failed:', e.message);
  for (const p of [A, B]) {
    await p.page.screenshot({ path: `${outDir}/modes_fail_${p.name}.png` }).catch(() => {});
    const text = await p.page.evaluate(() => document.querySelector('#ui')?.innerText?.slice(0, 400) ?? '').catch(() => '');
    console.error(`[modes] ${p.name} screen:`, text.replace(/\s+/g, ' '));
  }
  console.error(problems.join('\n'));
  await browser.close().catch(() => {});
  process.exit(1);
};
process.on('uncaughtException', fail);

// The start screen: Chromium (like most browsers) refuses sound before the first tap, so the loading
// screen ends with «▶ Play» when the menu music would play; a player arriving by an invite link (no
// music yet) goes straight in. Waits for either and presses Play when it is there.
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
}

try {
  // ── A: a capture-the-flag room ──────────────────────────────────────────
  await A.page.goto(base + '/');
  await pressPlay(A.page);
  check(await A.page.evaluate(() => window.__blatkom.music.playing()), 'A: «▶ Play» on the start screen starts the menu music');
  await nickname(A, `Flag Bearer ${RUN}`);
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  // A picks an avatar in the menu (saved on the server): B will see it in the lobby
  await A.page.locator('[data-testid=profile-strip] [data-testid=avatar-button]').click();
  await A.page.locator('.avapick button[data-avatar="dog"]').click();
  await A.page.locator('[data-testid=profile-strip] img.ava[data-avatar="dog"]').waitFor({ timeout: 20000 });
  await A.page.getByRole('button', { name: /Play with Friends/ }).click({ timeout: 30000 });
  await A.page.locator('.modebtn[data-mode="ctf"]').click();
  await A.page.getByRole('button', { name: 'Create a room' }).click();
  const code = (await A.page.locator('.code').textContent({ timeout: 20000 })).trim();
  check(/^[A-Za-z0-9]{6,16}$/.test(code), `A created a capture-the-flag room (invite ${code})`);
  await B.page.goto(`${base}/?invite=${encodeURIComponent(code)}`);
  await pressPlay(B.page);
  await nickname(B, `Перехватчик ${RUN}`);
  await A.page.getByText(/Players 2\//).waitFor({ timeout: 90000 });
  await B.page.getByText(/Игроки 2\//).waitFor({ timeout: 90000 });
  check((await A.page.locator('.teamcol').count()) === 2 && (await B.page.locator('.teamcol').count()) === 2, 'both lobbies show the red and blue columns');
  check((await B.page.locator('.modebtn[data-mode="ctf"][aria-pressed="true"]').count()) === 1, 'B (in Russian) sees the mode the host picked');
  check((await B.page.locator('.player img.ava[data-avatar="dog"]').count()) === 1, 'B sees the avatar A picked next to A in the lobby');
  const rulesB = await B.page.getByTestId('mode-rules').innerText();
  check(/флаг/i.test(rulesB), `B reads the rules in Russian («${rulesB.slice(0, 60)}…»)`);
  const teamsBefore = await A.page.evaluate(() => window.__blatkom.app.lastLobby.players.map((p) => `${p.name}:${p.team}`).sort().join(','));
  // host flips to base capture and back: the guest follows, the teams stay
  await A.page.locator('.modebtn[data-mode="bases"]').click();
  await B.page.locator('.modebtn[data-mode="bases"][aria-pressed="true"]').waitFor({ timeout: 10000 });
  await A.page.locator('.modebtn[data-mode="ctf"]').click();
  await B.page.locator('.modebtn[data-mode="ctf"][aria-pressed="true"]').waitFor({ timeout: 10000 });
  const teamsAfter = await A.page.evaluate(() => window.__blatkom.app.lastLobby.players.map((p) => `${p.name}:${p.team}`).sort().join(','));
  check(teamsBefore === teamsAfter, `switching between team modes keeps the teams (${teamsAfter})`);
  await A.page.screenshot({ path: `${outDir}/modes_lobby_A.png` });
  await B.page.screenshot({ path: `${outDir}/modes_lobby_B.png` });

  // ── the match ───────────────────────────────────────────────────────────
  await B.page.getByRole('button', { name: /^К бою!$/ }).click();
  await A.page.getByRole('button', { name: /^Start/ }).click();
  await Promise.all([A, B].map((p) => p.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 })));
  await A.page.waitForTimeout(1500);
  const state = await Promise.all(
    [A, B].map((p) =>
      p.page.evaluate(() => {
        const s = window.__blatkom.game.scene.getScene('game').session;
        const hud = window.__blatkom.game.scene.getScene('hud');
        return { mode: s.gameMode, flags: s.flags().map((f) => `${f.team}:${f.status}`).join(','), team: s.hud().myTeam, strip: hud.objTexts.map((x) => x.text).join('/') };
      }),
    ),
  );
  check(state.every((s) => s.mode === 'ctf' && s.flags === '0:home,1:home'), `both clients see two flags at home (${JSON.stringify(state)})`);
  check(state[0].team !== state[1].team, 'the two players are on different teams');
  check(/HOME/.test(state[0].strip) && /НА МЕСТЕ/.test(state[1].strip), `HUD strip in each player's language (${state[0].strip} | ${state[1].strip})`);
  await A.page.screenshot({ path: `${outDir}/modes_ctf_A.png` });
  await B.page.screenshot({ path: `${outDir}/modes_ctf_B.png` });
  // the 40-second match ends on time: a team result for both
  await A.page.getByText('Match report').waitFor({ timeout: 90000 });
  await B.page.getByText('Протокол матча').waitFor({ timeout: 30000 });
  const headA = await A.page.locator('table.table thead').innerText();
  const headB = await B.page.locator('table.table thead').innerText();
  check(/Flags/i.test(headA) && /Флаги/i.test(headB), 'results have the Flags column (English and Russian)');
  check((await A.page.locator('.teamwin').count()) === 1 && (await B.page.locator('.teamwin').count()) === 1, 'results show the team banner on both screens');
  await A.page.screenshot({ path: `${outDir}/modes_results_A.png`, fullPage: true });
  await B.page.screenshot({ path: `${outDir}/modes_results_B.png`, fullPage: true });

  // ── quick match by mode ─────────────────────────────────────────────────
  await A.page.getByRole('button', { name: 'To menu' }).click();
  // when the host leaves, the room goes back to the lobby: B leaves from the results or from the lobby
  await B.page.getByRole('button', { name: /^(В меню|← Выйти)$/ }).first().click();
  await B.page.getByRole('button', { name: /Быстрый матч/ }).waitFor({ timeout: 30000 });
  await A.page.getByRole('button', { name: /Quick Match/ }).click({ timeout: 30000 });
  await A.page.locator('.quickmode[data-mode="bases"]').click();
  await A.page.getByText(/Players 1\//).waitFor({ timeout: 30000 });
  await B.page.getByRole('button', { name: /Быстрый матч/ }).click({ timeout: 30000 });
  await B.page.locator('.quickmode[data-mode="bases"]').click();
  await A.page.getByText(/Players 2\//).waitFor({ timeout: 30000 });
  const qa = await A.page.evaluate(() => ({ room: window.__blatkom.app.lastLobby.roomId, mode: window.__blatkom.app.lastLobby.mode }));
  const qb = await B.page.evaluate(() => ({ room: window.__blatkom.app.lastLobby.roomId, mode: window.__blatkom.app.lastLobby.mode }));
  check(qa.room === qb.room && qa.mode === 'bases' && qb.mode === 'bases', `Quick Match «Base Capture» puts both into the same room (${qa.room})`);
  await B.page.screenshot({ path: `${outDir}/modes_quick_B.png` });

  // ── a browser that allows sound without a tap: no start screen, the music plays with the menu ──
  const free = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const C = await (await free.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  C.on('pageerror', (e) => problems.push(`[C pageerror] ${e.message}`));
  await C.goto(base + '/');
  await C.waitForFunction(() => document.getElementById('boot')?.classList.contains('boot--hidden') ?? true, null, { timeout: 90000 });
  const cState = await C.evaluate(() => ({ start: !!document.querySelector('[data-testid=boot-play]'), playing: window.__blatkom.music.playing() }));
  check(!cState.start && cState.playing, `autoplay allowed: the menu opens without the start screen and the music is already playing (${JSON.stringify(cState)})`);
  await free.close();
} catch (e) {
  await fail(e);
}
await browser.close();
const bad = problems.filter((p) => /pageerror/.test(p));
if (problems.length) console.log(problems.slice(0, 10).join('\n'));
const ok = checks.length >= 14 && checks.every((c) => c.ok) && bad.length === 0;
console.log(ok ? '[modes] passed' : '[modes] FAILED');
process.exit(ok ? 0 : 1);
