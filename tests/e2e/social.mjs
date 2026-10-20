// Social end-to-end test (v0.23): two independent browsers — A (English, desktop) and B (Russian,
// phone). The account window of a guest (A registers an email, B carries on as a guest), unique
// aliases with free variants, a friend request by alias with live delivery, private messages with
// unread badges and read receipts, «Play» → a room → a live invitation B joins from its card, the
// Top-100 table and the player's place.
//
// Usage: node tests/e2e/social.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node tests/e2e/social.mjs <baseUrl> <outDir>');
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
const RUN = Math.random().toString(36).slice(2, 6);

async function player(name, lang, viewport) {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  return { name, ctx, page };
}

async function pressPlay(page) {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  const play = page.getByTestId('boot-play');
  if (await play.count()) await play.click();
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('boot--hidden'), null, { timeout: 10000 });
}

const A = await player('A', 'en', { width: 1280, height: 720 });
const B = await player('B', 'ru', { width: 390, height: 844 });
const NB = `Тестер ${RUN}`;
const NA = `Social A ${RUN}`;
const EMAIL = `e2e-social-${RUN}@example.com`;
const friendRow = (p, list, name) => p.page.locator(`[data-testid=${list}] [data-friend="${name}"]`);

try {
  // ── B: a guest ──────────────────────────────────────────────────────────
  await B.page.goto(base + '/');
  await pressPlay(B.page);
  await B.page.getByTestId('welcome').waitFor({ timeout: 60000 });
  check(/Сохрани прогресс/i.test(await B.page.getByTestId('welcome').innerText()), 'B (Russian, phone): the account window opens with the menu');
  await B.page.screenshot({ path: `${outDir}/social_welcome_B.png` });
  await B.page.getByTestId('welcome-guest').click();
  const nickB = B.page.getByRole('textbox', { name: 'Кличка' });
  await nickB.waitFor({ timeout: 20000 });
  await nickB.fill(NB);
  await B.page.getByRole('button', { name: 'Готово' }).click();
  await B.page.getByTestId('menu-nick').filter({ hasText: NB }).waitFor({ timeout: 20000 });
  check(true, `B continued as a guest and took the alias «${NB}»`);

  // ── A: registers an email, then meets the unique-alias check ────────────
  await A.page.goto(base + '/');
  await pressPlay(A.page);
  await A.page.getByTestId('welcome').waitFor({ timeout: 60000 });
  await A.page.screenshot({ path: `${outDir}/social_welcome_A.png` });
  await A.page.getByTestId('welcome-email').fill(EMAIL);
  await A.page.getByTestId('welcome-password').fill('Social-e2e-pass-1');
  await A.page.getByTestId('welcome-password2').fill('Social-e2e-pass-1');
  await A.page.getByTestId('welcome-register').click();
  await A.page.getByTestId('welcome').waitFor({ state: 'detached', timeout: 20000 });
  const emailNow = await A.page.evaluate(() => window.__blatkom.app.online.profile.email);
  check(emailNow === EMAIL, `A created an account from the welcome window: the guest profile now has ${emailNow}`);
  const nickA = A.page.getByRole('textbox', { name: 'Alias' });
  await nickA.waitFor({ timeout: 20000 });
  await nickA.fill(NB.toUpperCase());
  await A.page.getByTestId('name-suggestion').first().waitFor({ timeout: 10000 });
  const hint = await A.page.getByTestId('name-hint').innerText();
  check(/is taken/.test(hint), `B's alias in capitals is taken for A («${hint.replace(/\s+/g, ' ').slice(0, 80)}»)`);
  await A.page.screenshot({ path: `${outDir}/social_alias_taken_A.png` });
  const sug = await A.page.getByTestId('name-suggestion').first().innerText();
  await A.page.getByTestId('name-suggestion').first().click();
  await A.page.getByText('✓ free').waitFor({ timeout: 10000 });
  check((await nickA.inputValue()) === sug, `a free variant fills the field («${sug}»)`);
  await nickA.fill(NA);
  await A.page.getByText('✓ free').waitFor({ timeout: 10000 });
  await A.page.getByRole('button', { name: 'Done' }).click();
  await A.page.getByTestId('menu-nick').filter({ hasText: NA }).waitFor({ timeout: 20000 });
  check(true, `A took the alias «${NA}»`);
  // the server refuses a taken alias even without the dialog's check (asked from here, not the page)
  const tokenA = await A.page.evaluate(() => localStorage.getItem('blatkom89.token'));
  const status = (await fetch(`${base}/api/me`, { method: 'PATCH', headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: NB.toLowerCase() }) })).status;
  check(status === 409, `PATCH /api/me with B's alias in lower case → ${status}`);

  // ── friends ─────────────────────────────────────────────────────────────
  await A.page.getByTestId('menu-friends').click();
  await A.page.getByTestId('friend-alias').fill(NB.toUpperCase());
  await A.page.getByTestId('send-request').click();
  await friendRow(A, 'friend-requests', NB).waitFor({ timeout: 10000 });
  check(true, 'A sent a friend request by alias (letter case does not matter)');
  await B.page.getByTestId('friends-badge').waitFor({ timeout: 10000 });
  check((await B.page.getByTestId('friends-badge').innerText()).trim() === '1', 'B: the Friends button in the menu shows 1 without a reload');
  await B.page.screenshot({ path: `${outDir}/social_menu_badge_B.png` });
  await B.page.getByTestId('menu-friends').click();
  await B.page.getByTestId('accept-friend').click();
  await friendRow(B, 'friends-list', NA).waitFor({ timeout: 10000 });
  await friendRow(A, 'friends-list', NB).waitFor({ timeout: 10000 });
  const statusOnA = await friendRow(A, 'friends-list', NB).locator('.friend__status').innerText();
  check(/online/.test(statusOnA), `B accepted; A's list shows B «${statusOnA}» at once`);
  await A.page.screenshot({ path: `${outDir}/social_friends_A.png` });

  // ── private messages ────────────────────────────────────────────────────
  await friendRow(A, 'friends-list', NB).getByTestId('open-chat').click();
  await A.page.getByTestId('chat-input').fill('Hey! Meet me by the garages.');
  await A.page.getByTestId('chat-send').click();
  await friendRow(B, 'friends-list', NA).locator('.nbadge').waitFor({ timeout: 10000 });
  check(true, 'B sees an unread badge on A in the friends list');
  await friendRow(B, 'friends-list', NA).getByTestId('open-chat').click();
  await B.page.locator('.msg', { hasText: 'Meet me by the garages' }).waitFor({ timeout: 10000 });
  await B.page.getByTestId('chat-input').fill('Иду, жди у гаражей');
  await B.page.getByTestId('chat-send').click();
  await A.page.locator('.msg', { hasText: 'Иду, жди у гаражей' }).waitFor({ timeout: 10000 });
  check(true, 'messages arrive both ways while the conversation is open');
  await A.page.locator('.msg--me .msg__time', { hasText: '✓✓' }).waitFor({ timeout: 10000 });
  check(true, 'A sees «✓✓» — B has read the message');
  await A.page.screenshot({ path: `${outDir}/social_chat_A.png` });
  await B.page.screenshot({ path: `${outDir}/social_chat_B.png` });
  await A.page.keyboard.press('Escape');
  await B.page.keyboard.press('Escape');

  // ── «Play» with a friend: a room and a live invitation ──────────────────
  await friendRow(A, 'friends-list', NB).locator('.btn--red').click();
  await A.page.getByTestId('invite-friends').waitFor({ timeout: 30000 });
  await B.page.getByTestId('invite-card').waitFor({ timeout: 15000 });
  const card = await B.page.getByTestId('invite-card').innerText();
  check(card.includes(NA), `B gets the invitation card («${card.replace(/\s+/g, ' ').slice(0, 70)}»)`);
  await B.page.screenshot({ path: `${outDir}/social_invite_B.png` });
  await B.page.getByTestId('invite-join').click();
  await A.page.getByText(/Players 2\//).waitFor({ timeout: 30000 });
  await B.page.getByText(/Игроки 2\//).waitFor({ timeout: 30000 });
  check(true, 'B joined the room from the card; both lobbies show 2 players');
  const stillListed = await A.page.locator(`[data-testid=invite-friends] [data-friend="${NB}"]`).count();
  check(stillListed === 0, 'A\'s «Invite friends» no longer offers B, who is in the room');
  await A.page.screenshot({ path: `${outDir}/social_lobby_A.png` });
  await A.page.getByRole('button', { name: '← Leave' }).click();
  await B.page.getByRole('button', { name: '← Выйти' }).click();

  // ── Top-100 ─────────────────────────────────────────────────────────────
  await B.page.getByTestId('menu-top').click({ timeout: 20000 });
  await B.page.getByTestId('top-me').getByText(/Доиграй/).waitFor({ timeout: 15000 });
  check(true, 'B without matches: «finish an online match to get into the table»');
  const rows = await B.page.locator('[data-testid=top-table] tbody tr').count();
  const ranks = await B.page.locator('[data-testid=top-table] tbody tr td.toprank-cell').allInnerTexts();
  check(ranks.every((r, i) => Number(r) === i + 1), `the table numbers its ${rows} players 1…${rows} without gaps or ties`);
  await B.page.locator('.seg button[data-by="kills"]').click();
  await B.page.locator('.seg button[data-by="kills"][aria-pressed="true"]').waitFor({ timeout: 5000 });
  await B.page.waitForTimeout(800);
  await B.page.screenshot({ path: `${outDir}/social_top_B.png` });

  // ── A again: the email account is remembered, no account window ─────────
  await A.page.reload();
  await pressPlay(A.page);
  await A.page.getByTestId('menu-nick').filter({ hasText: NA }).waitFor({ timeout: 60000 });
  await A.page.waitForTimeout(1500);
  check((await A.page.getByTestId('welcome').count()) === 0, 'after a reload A (with an email) is not asked again');
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  await A.page.screenshot({ path: `${outDir}/social_fail_A.png` }).catch(() => {});
  await B.page.screenshot({ path: `${outDir}/social_fail_B.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[social] ${failed} problem(s)` : `[social] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
