// Invitations end-to-end (V2.0; v0.2.18: an invitation that counts pays talons — the $BLAT screen, its
// welcome and BLAT DROP are gone with the whole crypto theme). Two independent browsers — A (English,
// desktop) and B (Russian, phone):
//  • A new player gets nothing at sign-up (no welcome, no $BLAT); the menu's BLATS tile shows 0.
//  • Friends → «Invite to the game · +150 talons» → the invite screen: the personal link (Copy puts it
//    on the clipboard), invited 0.
//  • B opens the game through A's link: B's new account is attached to A (pending) and the address loses
//    ?ref=; A's screen counts one invited, one waiting.
//  • B's first whole online match — written straight into the test database (DATABASE_URL); the match
//    path itself is covered by apps/server/src/referrals/referrals.test.ts — then B opens the invite
//    screen: the invitation counts, A hears it live («… played their first match through your link: +150
//    talons»), A's talons grow by exactly 150 (one ledger row), counted 1; B opening it again pays nothing
//    more; an existing player who opens a link is not attached to anyone; B's phone screen has no sideways
//    scroll.
//  • With an admin login: the dashboard's «Приглашения» page and the player's card show it too.
//
// Usage: DATABASE_URL=… node tests/e2e/invite.mjs <baseUrl> <outDir> [adminUser] [adminPass]
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/invite.mjs <baseUrl> <outDir> [adminUser] [adminPass]');
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
const REWARD = 150;

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
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 90000 });
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { name, ctx, page, id: me.id };
}

const stat = async (page, id) => (await page.getByTestId(id).locator('b').innerText()).trim();
const screen = (page) =>
  page.evaluate(() => ({
    link: document.querySelector('[data-testid=invite-link]')?.value,
    earned: document.querySelector('[data-testid=invite-earned]')?.textContent?.replace(/\s+/g, ' ').trim(),
    reward: document.querySelector('[data-testid=invite-reward]')?.textContent?.replace(/\s+/g, ' ').trim(),
    recent: [...document.querySelectorAll('[data-testid=invite-recent] .invrecent__row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
  }));
/** Menu → Friends → «Invite to the game» → the invite screen. */
async function openInvite(page) {
  await page.getByTestId('menu-friends').click();
  await page.getByTestId('friends-invite-game').click();
  await page.getByTestId('invite').waitFor({ timeout: 20000 });
}
/** Back (one screen at a time) until the menu. */
async function toMenu(page) {
  for (let i = 0; i < 4 && !(await page.getByTestId('menu-nick').isVisible().catch(() => false)); i++) {
    await page.locator('.back').first().click();
    await page.waitForTimeout(300);
  }
  await page.getByTestId('menu-nick').waitFor({ timeout: 15000 });
}
const talons = async (id) => (await sql`SELECT tokens FROM profiles WHERE user_id = ${id}`)[0]?.tokens ?? 0;

try {
  // ── A: nothing at sign-up; the invite screen and the link ─────────────────
  const A = await player('Inviter', 'en', { width: 1280, height: 760 });
  await A.page.waitForTimeout(800);
  const tile = (await A.page.getByTestId('menu-blats-balance').innerText()).trim();
  check(tile === '0', `A: the menu’s BLATS tile shows 0 — nothing is paid at sign-up («${tile}»)`);
  const toastsA0 = await A.page.evaluate(() => window.__toasts);
  check(!toastsA0.some((t) => /\$BLAT|welcome to the district/i.test(t)), `A is not told about any $BLAT welcome (${toastsA0.join(' | ') || 'no toasts'})`);
  const ledger0 = await sql`SELECT currency, reason FROM currency_ledger WHERE user_id = ${A.id}`;
  check(ledger0.length === 0, `A’s ledger is empty after sign-up (${ledger0.map((r) => `${r.currency}:${r.reason}`).join(', ')})`);
  await A.page.screenshot({ path: `${outDir}/menu_A.png` });
  await A.page.getByTestId('menu-friends').click();
  const inviteBtn = (await A.page.getByTestId('friends-invite-game').innerText()).replace(/\s+/g, ' ').trim();
  check(/Invite to the game · \+150 talons/i.test(inviteBtn), `Friends: «${inviteBtn}»`);
  await A.page.getByTestId('friends-invite-game').click();
  await A.page.getByTestId('invite').waitFor({ timeout: 20000 });
  const a1 = await screen(A.page);
  check(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\?ref=[A-Za-z0-9]{8}$`).test(a1.link ?? ''), `A’s personal link: ${a1.link}`);
  check(/150/.test(a1.reward ?? '') && /talons/.test(a1.reward ?? ''), `the reward: «${a1.reward}»`);
  check((await stat(A.page, 'invite-invited')) === '0', 'invited 0');
  await A.page.getByTestId('invite-copy').click();
  const clip = await A.page.evaluate(() => navigator.clipboard.readText());
  check(clip === a1.link, 'Copy puts the link on the clipboard');
  const text = await A.page.getByTestId('invite').innerText();
  check(!/\$BLAT|Solana|crypto|token/i.test(text), 'the invite screen says nothing about $BLAT, Solana or tokens');
  await A.page.screenshot({ path: `${outDir}/invite_A.png` });
  const code = a1.link.split('ref=')[1];

  // ── B comes through the link ──────────────────────────────────────────────
  const B = await player('Recruit', 'ru', { width: 390, height: 844 }, `/?ref=${code}`);
  check(!B.page.url().includes('ref='), `B: the address loses ?ref= once read (${B.page.url()})`);
  const [ref1] = await sql`SELECT referrer_id, status FROM referrals WHERE referee_id = ${B.id}`;
  check(ref1?.referrer_id === A.id && ref1?.status === 'pending', `B’s new account is attached to A, waiting for a whole match (${ref1?.status})`);
  await toMenu(A.page);
  await openInvite(A.page);
  check((await stat(A.page, 'invite-invited')) === '1' && (await stat(A.page, 'invite-pending')) === '1' && (await stat(A.page, 'invite-confirmed')) === '0', 'A’s screen: invited 1, waiting 1, counted 0');
  const recent = (await screen(A.page)).recent[0] ?? '';
  check(recent.includes(`recruit_${RUN}`) && /waiting for their first match/.test(recent), `A sees B waiting for a first match («${recent}»)`);

  // ── B's first whole online match → the invitation counts ─────────────────
  const t0 = await talons(A.id);
  const mid = randomUUID();
  await sql`INSERT INTO matches (id, room_id, map_id, mode, is_private, status, started_at, ended_at, duration_ms, end_reason, player_count, results_processed_at)
            VALUES (${mid}, 'e2einvite', 'factory', 'ffa', false, 'completed', now() - interval '3 minutes', now(), 180000, 'time', 2, now())`;
  await sql`INSERT INTO match_participants (match_id, user_id, character, place, kills, deaths, score, damage_dealt, completed, won, joined_at)
            VALUES (${mid}, ${B.id}, 'petya', 1, 3, 1, 6, 300, true, true, now() - interval '3 minutes')`;
  await openInvite(B.page);
  await A.page.waitForFunction((n) => window.__toasts.some((t) => new RegExp(`played their first match through your link: \\+${n} talons`).test(t)), REWARD, { timeout: 15000 });
  check(true, `A hears it live: «Recruit … played their first match through your link: +${REWARD} talons»`);
  await A.page.waitForFunction(() => document.querySelector('[data-testid=invite-confirmed] b')?.textContent === '1', null, { timeout: 15000 });
  const t1 = await talons(A.id);
  check(t1 - t0 === REWARD, `A’s talons: ${t0} → ${t1} (+${REWARD})`);
  const a2 = await screen(A.page);
  check(/150/.test(a2.earned ?? ''), `A’s screen: «${a2.earned}»`);
  check(a2.recent[0]?.includes(`recruit_${RUN}`) && /counted/.test(a2.recent[0] ?? ''), `A’s invitations: «${a2.recent[0]}»`);
  check((await stat(A.page, 'invite-pending')) === '0', 'nobody waiting any more');
  await A.page.screenshot({ path: `${outDir}/invite_counted_A.png` });
  // B again: nothing more is paid
  await toMenu(B.page);
  await openInvite(B.page);
  await B.page.waitForTimeout(600);
  const ledgerA = await sql`SELECT currency, ref, delta FROM currency_ledger WHERE user_id = ${A.id} ORDER BY id`;
  check(ledgerA.map((r) => `${r.currency}:${r.ref}:${r.delta}`).join(',') === `tokens:referral:${B.id}:${REWARD}`, `A’s ledger: one invitation, paid once in talons (${ledgerA.map((r) => `${r.currency}:${r.ref}:${r.delta}`).join(', ')})`);
  const over = await B.page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check(over <= 0, `B’s phone screen: no sideways scroll (${over}px)`);
  const bText = await B.page.getByTestId('invite').innerText();
  check(/Позвать друзей/i.test(bText) && /талон/.test(bText), 'B’s invite screen is in Russian, in talons');
  await B.page.screenshot({ path: `${outDir}/invite_B_phone.png`, fullPage: true });
  const bLink = await B.page.getByTestId('invite-link').inputValue();

  // ── an existing player opening a link is not attached ─────────────────────
  const bCode = bLink.split('ref=')[1];
  await A.page.goto(`${base}/?ref=${bCode}`);
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
  await A.page.waitForTimeout(800);
  const self = await sql`SELECT 1 FROM referrals WHERE referee_id = ${A.id}`;
  check(self.length === 0, 'A (an existing account) opening B’s link is not attached to anyone');

  // ── the dashboard ─────────────────────────────────────────────────────────
  if (adminUser && adminPass) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ru-RU', timezoneId: 'UTC' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`[admin pageerror] ${e.message}`));
    page.on('dialog', (d) => void d.accept());
    await page.goto(base + '/admin');
    await page.locator('input[name=username]').fill(adminUser);
    await page.locator('input[name=password]').fill(adminPass);
    await page.locator('button[type=submit]').click();
    const nav = (await page.locator('nav').innerText()).replace(/\s+/g, ' ');
    check(!/\$BLAT/.test(nav), `the dashboard’s menu has no $BLAT page («${nav}»)`);
    await page.locator('nav a', { hasText: 'Приглашения' }).click();
    await page.locator('.tile-label', { hasText: 'Талонов за приглашения' }).waitFor({ timeout: 15000 });
    await page.locator('button.chip', { hasText: 'все' }).click();
    const refCard = page.getByTestId('referrals-card');
    await refCard.locator('tbody tr', { hasText: `recruit_${RUN}` }).waitFor({ timeout: 15000 });
    const row = await refCard.locator('tbody tr', { hasText: `recruit_${RUN}` }).first().evaluate((el) => [...el.cells].map((c) => c.textContent.trim()).join(' | '));
    check(/засчитано/.test(row) && row.includes(`inviter_${RUN}`) && /\| 150 \|/.test(row), `admin «Приглашения»: the invitation, counted, 150 talons («${row.replace(/\s+/g, ' ')}»)`);
    await page.screenshot({ path: `${outDir}/admin_referrals.png`, fullPage: true });
    await page.goto(`${base}/admin#/players/${A.id}`);
    const card = page.locator('section.card').filter({ has: page.locator('h3', { hasText: /^Приглашения$/ }) });
    await card.waitFor({ timeout: 15000 });
    const cardText = (await card.innerText()).replace(/\s+/g, ' ');
    check(/Код приглашения/.test(cardText) && cardText.includes(code) && /Засчитано приглашений 1/i.test(cardText) && /Талонов за приглашения 150/i.test(cardText), `admin player card: the code, one counted invitation, 150 talons («${cardText.slice(0, 160)}…»)`);
    await page.screenshot({ path: `${outDir}/admin_player.png`, fullPage: true });
    await ctx.close();
  }
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  check(false, `invitations flow: ${e.message}`);
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[invite] ${failed.length} of ${checks.length} checks failed` : `[invite] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
