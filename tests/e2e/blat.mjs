// $BLAT end-to-end (V2.0): two independent browsers — A (English, desktop) and B (Russian, phone).
// A new player has the 300 $BLAT welcome on the menu tile at once (and is told so); the $BLAT screen:
// balance, history («Level 1»), the next level's reward, the personal link (Copy puts it on the
// clipboard). B opens the game through A's link: B's new account is attached to A (pending) and the
// address loses ?ref=; A's screen counts one invited, one waiting. B's first whole online match — written
// straight into the test database (DATABASE_URL); the match path itself is covered by
// apps/server/src/blat/blat.test.ts — then B opens $BLAT: the invitation counts, A hears it live, A's
// balance becomes 1 800 and «counted» 1; B opening it again pays nothing more; an existing player who
// opens a link is not attached to anyone; B's phone screen has no sideways scroll. With an admin login,
// the dashboard's $BLAT page and the player's card show it too.
// Part C: the BLAT DROP tab says the date isn't set yet; the administrator sets one in the dashboard (or,
// without an admin login, the test writes it into the database) and A's desktop and B's phone count down
// to the same second; a balance snapshot from the dashboard downloads as CSV with A's 1 800 and B's 300;
// clearing the date brings «isn't set yet» back.
//
// Usage: DATABASE_URL=… node tests/e2e/blat.mjs <baseUrl> <outDir> [adminUser] [adminPass]
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/blat.mjs <baseUrl> <outDir> [adminUser] [adminPass]');
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
const RUN = Math.random().toString(36).slice(2, 6);

async function player(name, lang, viewport, path = '/') {
  const phone = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('blatkom89.lang.v1', l);
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
    // every toast the page shows, for the checks (they fade out after a few seconds)
    window.__toasts = [];
    const watch = () =>
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
      }).observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch();
    else document.addEventListener('DOMContentLoaded', watch);
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + path);
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
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { name, ctx, page, id: me.id };
}

const tileBalance = (page, value) => page.waitForFunction((v) => document.querySelector('[data-testid=menu-blat-balance]')?.textContent === v, value, { timeout: 15000 });
const stat = async (page, id) => (await page.getByTestId(id).locator('b').innerText()).trim();
const screen = (page) =>
  page.evaluate(() => ({
    balance: document.querySelector('[data-testid=blat-balance]')?.textContent?.trim(),
    link: document.querySelector('[data-testid=blat-link]')?.value,
    history: [...document.querySelectorAll('[data-testid=blat-history] .blathist__row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    next: document.querySelector('.blat__next')?.textContent?.replace(/\s+/g, ' ').trim(),
  }));
async function openBlat(page) {
  await page.getByTestId('menu-blat').click();
  await page.getByTestId('blat-balance').waitFor({ timeout: 20000 });
}
async function openDrop(page) {
  await page.getByTestId('menu-blat').click();
  await page.getByTestId('blat-tab-drop').click();
  await page.getByTestId('blat-drop').waitFor({ timeout: 20000 });
}
/** Back to the balance tab and to BLAT DROP again (a fresh answer from the server). */
async function reopenDrop(page) {
  await page.getByTestId('blat-tab-balance').click();
  await page.getByTestId('blat-balance').waitFor({ timeout: 20000 });
  await page.getByTestId('blat-tab-drop').click();
  await page.getByTestId('blat-drop').waitFor({ timeout: 20000 });
}
const readCount = (page) => page.evaluate(() => ['d', 'h', 'm', 's'].map((k) => Number(document.querySelector(`[data-testid=drop-${k}]`)?.textContent)));
const seconds = ([d, h, m, s]) => ((d * 24 + h) * 60 + m) * 60 + s;
async function toMenu(page) {
  await page.locator('.back').first().click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 15000 });
}

try {
  // ── A: the welcome, the screen, the link ─────────────────────────────────
  const A = await player('Inviter', 'en', { width: 1280, height: 760 });
  await tileBalance(A.page, '300');
  check(true, 'A: the menu’s $BLAT tile shows the 300 welcome straight after sign-up');
  const toastsA = await A.page.evaluate(() => window.__toasts);
  check(toastsA.some((t) => t.includes('+300 $BLAT — welcome to the district')), `A is told: «+300 $BLAT — welcome to the district» (${toastsA.join(' | ')})`);
  await A.page.screenshot({ path: `${outDir}/blat_menu_A.png` });
  await openBlat(A.page);
  const a1 = await screen(A.page);
  check(a1.balance === '300', `A’s $BLAT screen: balance 300 (${a1.balance})`);
  check(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\?ref=[A-Za-z0-9]{8}$`).test(a1.link ?? ''), `A’s personal link: ${a1.link}`);
  check(a1.history.length === 1 && /\+300/.test(a1.history[0]) && /Level 1/.test(a1.history[0]), `history: one line, +300 for level 1 (${a1.history.join(' / ')})`);
  check(/level 2/.test(a1.next ?? '') && /350/.test(a1.next ?? ''), `the next level’s reward: ${a1.next}`);
  await A.page.getByTestId('blat-copy').click();
  const clip = await A.page.evaluate(() => navigator.clipboard.readText());
  check(clip === a1.link, 'Copy puts the link on the clipboard');
  await A.page.screenshot({ path: `${outDir}/blat_screen_A.png`, fullPage: true });
  const code = a1.link.split('ref=')[1];

  // ── B comes through the link ──────────────────────────────────────────────
  const B = await player('Recruit', 'ru', { width: 390, height: 844 }, `/?ref=${code}`);
  check(!B.page.url().includes('ref='), `B: the address loses ?ref= once read (${B.page.url()})`);
  const [ref1] = await sql`SELECT referrer_id, status FROM referrals WHERE referee_id = ${B.id}`;
  check(ref1?.referrer_id === A.id && ref1?.status === 'pending', `B’s new account is attached to A, waiting for a whole match (${ref1?.status})`);
  await tileBalance(B.page, '300');
  const toastsB = await B.page.evaluate(() => window.__toasts);
  check(toastsB.some((t) => t.includes('+300 $BLAT — добро пожаловать на район')), `B (Russian) is told: «+300 $BLAT — добро пожаловать на район» (${toastsB.join(' | ')})`);
  await toMenu(A.page);
  await openBlat(A.page);
  check((await stat(A.page, 'blat-invited')) === '1' && (await stat(A.page, 'blat-pending')) === '1' && (await stat(A.page, 'blat-confirmed')) === '0', 'A’s screen: invited 1, waiting 1, counted 0');
  const recent = await A.page.locator('.blatrecent__row').first().innerText();
  check(recent.includes(`Recruit ${RUN}`) && /waiting for their first match/.test(recent), `A sees B waiting for a first match («${recent.replace(/\s+/g, ' ')}»)`);

  // ── B's first whole online match → the invitation counts ─────────────────
  const mid = randomUUID();
  await sql`INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, ended_at, duration_ms, end_reason, player_count, results_processed_at)
            VALUES (${mid}, 'e2eblat', 'factory', 'ffa', false, 'completed', now() - interval '3 minutes', now(), 180000, 'time', 2, now())`;
  await sql`INSERT INTO match_participants (match_id, user_id, character, place, kills, deaths, score, damage_dealt, completed, won, joined_at)
            VALUES (${mid}, ${B.id}, 'petya', 1, 3, 1, 6, 300, true, true, now() - interval '3 minutes')`;
  await openBlat(B.page);
  await A.page.waitForFunction(() => window.__toasts.some((t) => /played their first match through your link: \+1,500 \$BLAT/.test(t)), null, { timeout: 15000 });
  check(true, 'A hears it live: «Recruit … played their first match through your link: +1,500 $BLAT»');
  await A.page.waitForFunction(() => document.querySelector('[data-testid=blat-confirmed] b')?.textContent === '1', null, { timeout: 15000 });
  const a2 = await screen(A.page);
  check(a2.balance === '1,800', `A’s balance: 300 + 1,500 = ${a2.balance}`);
  check(a2.history[0]?.includes(`Invitation: Recruit ${RUN}`) && a2.history[0]?.includes('+1,500'), `A’s history: «${a2.history[0]}»`);
  check((await stat(A.page, 'blat-pending')) === '0', 'nobody waiting any more');
  await A.page.screenshot({ path: `${outDir}/blat_counted_A.png`, fullPage: true });
  // B again: nothing more is paid
  await toMenu(B.page);
  await openBlat(B.page);
  await B.page.waitForTimeout(600);
  const ledgerA = await sql`SELECT ref, delta FROM currency_ledger WHERE user_id = ${A.id} AND currency = 'blat' ORDER BY id`;
  check(ledgerA.map((r) => `${r.ref}:${r.delta}`).join(',') === `level:1:300,referral:${B.id}:1500`, `A’s ledger: the welcome and one invitation, each once (${ledgerA.map((r) => `${r.ref}:${r.delta}`).join(', ')})`);
  const b1 = await screen(B.page);
  check(b1.balance === '300', `B’s own balance: 300 (${b1.balance})`);
  const over = await B.page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check(over <= 0, `B’s phone screen: no sideways scroll (${over}px)`);
  await B.page.screenshot({ path: `${outDir}/blat_screen_B_phone.png`, fullPage: true });
  await toMenu(A.page);
  await tileBalance(A.page, '1,800');
  check(true, 'A’s menu tile follows: 1,800');
  await A.page.screenshot({ path: `${outDir}/blat_menu_A_after.png` });

  // ── an existing player opening a link is not attached ─────────────────────
  const bCode = b1.link.split('ref=')[1];
  await A.page.goto(`${base}/?ref=${bCode}`);
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
  await A.page.waitForTimeout(800);
  const self = await sql`SELECT 1 FROM referrals WHERE referee_id = ${A.id}`;
  check(self.length === 0, 'A (an existing account) opening B’s link is not attached to anyone');

  // ── the dashboard ─────────────────────────────────────────────────────────
  let admin = null;
  if (adminUser && adminPass) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ru-RU', timezoneId: 'UTC', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`[admin pageerror] ${e.message}`));
    // the dashboard asks before every change
    page.on('dialog', (d) => void d.accept());
    await page.goto(base + '/admin');
    await page.locator('input[name=username]').fill(adminUser);
    await page.locator('input[name=password]').fill(adminPass);
    await page.locator('button[type=submit]').click();
    await page.locator('nav a', { hasText: '$BLAT' }).click();
    await page.locator('.tile-label', { hasText: 'Засчитано приглашений' }).waitFor({ timeout: 15000 });
    await page.locator('button.chip', { hasText: 'все' }).click();
    const refCard = page.locator('section.card').filter({ has: page.locator('h3', { hasText: /^Приглашения$/ }) });
    await refCard.locator('tbody tr', { hasText: `Recruit ${RUN}` }).waitFor({ timeout: 15000 });
    const row = await refCard.locator('tbody tr', { hasText: `Recruit ${RUN}` }).first().evaluate((el) => [...el.cells].map((c) => c.textContent.trim()).join(' | '));
    check(/засчитано/.test(row) && row.includes(`Inviter ${RUN}`) && /1[\s ,.]?500/.test(row), `admin «$BLAT»: the invitation, counted, 1 500 («${row.replace(/\s+/g, ' ')}»)`);
    await page.screenshot({ path: `${outDir}/blat_admin.png`, fullPage: true });
    await page.goto(`${base}/admin#/players/${A.id}`);
    await page.locator('h3', { hasText: '$BLAT и приглашения' }).waitFor({ timeout: 15000 });
    const card = await page.locator('section.card', { hasText: '$BLAT и приглашения' }).evaluate((el) => el.textContent);
    check(/Код приглашения/.test(card) && card.includes(code) && /Засчитано приглашений\s*1/.test(card), 'admin player card: the code, one counted invitation');
    await page.screenshot({ path: `${outDir}/blat_admin_player.png`, fullPage: true });
    admin = { ctx, page };
  }

  // ── BLAT DROP (part C) ─────────────────────────────────────────────────────
  // v0.2.17: the release sets the owner's date; an administrator's «not set» takes it away
  await sql`INSERT INTO app_settings (key, value) VALUES ('blat_drop.announce_at', ${sql.json({ announceAt: null })})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await openDrop(A.page);
  const none = (await A.page.getByTestId('drop-date').innerText()).trim();
  check(/isn’t set yet/.test(none) && (await A.page.getByTestId('drop-count').count()) === 0, `A’s BLAT DROP tab before a date is set: «${none}», no countdown`);
  const prepNone = (await A.page.getByTestId('drop-prep').innerText()).trim();
  check(/being accumulated; the announcement date isn’t set yet/.test(prepNone), `the preparation status says so too: «${prepNone}»`);
  await A.page.screenshot({ path: `${outDir}/blat_drop_none_A.png` });
  const target = new Date(Date.now() + 30 * 86_400_000 + 3 * 3_600_000);
  target.setUTCSeconds(0, 0);
  if (admin) {
    await admin.page.goto(`${base}/admin#/blat`);
    const card = admin.page.getByTestId('drop-card');
    await card.getByTestId('drop-input').waitFor({ timeout: 15000 });
    await card.getByTestId('drop-input').fill(target.toISOString().slice(0, 16));
    await card.getByTestId('drop-save').click();
    await card.getByTestId('drop-current').filter({ hasText: 'задана в панели' }).waitFor({ timeout: 15000 });
    check(true, `the administrator set the date in the dashboard («${(await card.getByTestId('drop-current').innerText()).trim()}»)`);
  } else {
    await sql`INSERT INTO app_settings (key, value) VALUES ('blat_drop.announce_at', ${sql.json({ announceAt: target.toISOString() })})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  await reopenDrop(A.page);
  await A.page.getByTestId('drop-count').waitFor({ timeout: 15000 });
  await toMenu(B.page);
  await openDrop(B.page);
  await B.page.getByTestId('drop-count').waitFor({ timeout: 15000 });
  await A.page.waitForTimeout(1200);
  const [ta, tb] = await Promise.all([readCount(A.page), readCount(B.page)]);
  const expectLeft = Math.floor((target.getTime() - Date.now()) / 1000);
  check(ta[0] === 30 && Math.abs(seconds(ta) - expectLeft) <= 3, `A’s countdown: ${ta[0]} d ${ta[1]} h ${ta[2]} min ${ta[3]} s (≈ ${expectLeft} s left)`);
  check(Math.abs(seconds(ta) - seconds(tb)) <= 2, `B’s phone counts down to the same second (${tb.join(':')} vs ${ta.join(':')})`);
  const mineBal = (await A.page.getByTestId('drop-balance').innerText()).replace(/\s+/g, ' ').trim();
  const mineFriends = (await A.page.getByTestId('drop-friends').innerText()).replace(/\s+/g, ' ').trim();
  check(/1,800/.test(mineBal) && /^1 /.test(mineFriends), `A’s BLAT DROP tab: A’s $BLAT and counted friends («${mineBal}» · «${mineFriends}»)`);
  const prepSet = (await A.page.getByTestId('drop-prep').innerText()).trim();
  check(/until the announcement date/.test(prepSet), `the preparation status: «${prepSet}»`);
  const dateText = (await A.page.getByTestId('drop-date').innerText()).trim();
  check(dateText.includes(String(target.getUTCFullYear())), `A sees the date: «${dateText}»`);
  const dropOver = await B.page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check(dropOver <= 0, `B’s BLAT DROP fits the phone (${dropOver}px sideways)`);
  await A.page.screenshot({ path: `${outDir}/blat_drop_A.png` });
  await B.page.screenshot({ path: `${outDir}/blat_drop_B_phone.png` });
  if (admin) {
    const snaps = admin.page.getByTestId('snapshots-card');
    await snaps.getByTestId('snapshot-take').click();
    await snaps.locator('tbody tr').first().waitFor({ timeout: 15000 });
    const [dl] = await Promise.all([admin.page.waitForEvent('download'), snaps.locator('tbody tr').first().locator('a', { hasText: 'CSV' }).click()]);
    const csvText = readFileSync(await dl.path(), 'utf8');
    check(csvText.includes(`${A.id},Inviter ${RUN},1800,`) && csvText.includes(`${B.id},Recruit ${RUN},300,`), `the dashboard’s balance snapshot downloads as CSV with A’s 1 800 and B’s 300 (${csvText.split('\r\n').length - 2} rows)`);
    await admin.page.screenshot({ path: `${outDir}/blat_admin_drop.png`, fullPage: true });
    await admin.page.getByTestId('drop-card').getByTestId('drop-clear').click();
    await admin.page.getByTestId('drop-card').getByTestId('drop-current').filter({ hasText: 'не задана' }).waitFor({ timeout: 15000 });
  } else {
    await sql`UPDATE app_settings SET value = ${sql.json({ announceAt: null })} WHERE key = 'blat_drop.announce_at'`;
  }
  await reopenDrop(A.page);
  const again = (await A.page.getByTestId('drop-date').innerText()).trim();
  check(/isn’t set yet/.test(again), `the date taken away: «${again}» again`);
  // the owner's date back, as the release sets it (migration 022)
  await sql`INSERT INTO app_settings (key, value) VALUES ('blat_drop.announce_at', ${sql.json({ announceAt: '2027-02-08T21:00:00.000Z' })})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (admin) await admin.ctx.close();
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  check(false, `$BLAT flow: ${e.message}`);
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[blat] ${failed.length} of ${checks.length} checks failed` : `[blat] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
