// v0.2.17 part 3 end-to-end: «позвать друга в бой» and gang against gang.
//
// Gang battle: A (desktop, English) and B are gang X, C and D (phone, Russian) gang Y, E is in no gang. B
// and C play without a browser (the game's API and sockets, as a client does — four game pages at once are
// too heavy for software rendering). A opens Y's page from the gangs' table, «Call out to battle» → the
// sheet (2×2) → A is in the room «Gang battle 2×2» with [X] vs [Y]; D gets the call's card live and comes
// in by it, B and C hear the call on their social sockets and come in; B is on red with A, C and D on blue;
// nobody is offered the other side; E opens the room's link and is turned away. A starts: the match runs,
// the results come, and both gangs' tournament records count the battle. Then a friend's «To battle»: D
// calls A (friends) to a tournament duel 1×1 — A's card, both in the duel room.
//
// Usage: DATABASE_URL=… node tests/e2e/battle.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import postgres from 'postgres';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/battle.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const checks = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 5);
const wsBase = base.replace(/^http/, 'ws');

/** The loading screen is over (software rendering under load can take a while); «▶ Play» pressed if asked. */
async function booted(page) {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 120000 });
  if (await page.getByTestId('boot-play').count()) await page.getByTestId('boot-play').click();
}

async function player(name, lang, viewport = { width: 1280, height: 720 }) {
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
  const log = [];
  page.on('console', (m) => log.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  page.on('requestfailed', (r) => log.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => r.url().includes('/api/') && log.push(`${r.status()} ${r.url().replace(base, '')}`));
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket|status of 4\d\d/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + '/');
  await booted(page);
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const id = await page.evaluate(() => window.__blatkom.app.online.profile.id);
  const token = await page.evaluate(() => window.__blatkom.app.online.api.token);
  return { name, ctx, page, id, token, log };
}

/** A player without a browser: a guest account, the social socket (calls, invitations), a room socket. */
async function socketPlayer(name) {
  const r = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `${name} ${RUN}`, deviceId: randomBytes(18).toString('base64url') }) });
  const auth = await r.json();
  if (!auth.token) throw new Error(`guest sign-in for ${name}: ${JSON.stringify(auth)}`);
  const events = [];
  const social = new WebSocket(`${wsBase}/ws/social`);
  social.on('open', () => social.send(JSON.stringify({ type: 'auth', token: auth.token })));
  social.on('message', (d) => events.push(JSON.parse(String(d))));
  social.on('error', () => {});
  const p = { name, id: auth.profile.id, token: auth.token, events, social, room: null };
  p.next = async (type, ms = 20000) => {
    const end = Date.now() + ms;
    for (;;) {
      const e = events.find((x) => x.type === type);
      if (e) return e;
      if (Date.now() > end) throw new Error(`${name}: no ${type}`);
      await new Promise((res) => setTimeout(res, 100));
    }
  };
  /** Comes into a room: resolves with the first roster (or the error that turned the player away). */
  p.enter = (roomId) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${wsBase}/ws`);
      p.room = ws;
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', protocol: 8, token: auth.token, roomId, character: 'petya', clientVersion: 'e2e' })));
      ws.on('message', (d, bin) => {
        if (bin) return;
        const m = JSON.parse(String(d));
        if (m.type === 'roster' || m.type === 'error') resolve(m);
      });
      ws.on('error', () => {});
    });
  await p.next('ready');
  return p;
}
const api = async (token, method, path, body) => {
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  const json = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
  return json;
};
const FLAG = { pattern: 'h3', colors: [0, 8, 5] };
const EMBLEM = { icon: 'gear', color: 9 };

let B = null;
let C = null;
try {
  const A = await player('Warlord', 'en');
  const D = await player('Deputy', 'ru', { width: 390, height: 844 });
  B = await socketPlayer('Brother');
  C = await socketPlayer('Chief');
  // the two gangs (founded and joined through the API — the gangs' screens are covered by clubs.mjs)
  const tagX = `X${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g, 'Q').slice(0, 4);
  const tagY = `Y${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g, 'Q').slice(0, 4);
  const X = await api(A.token, 'POST', '/api/clubs', { name: `Warlords ${RUN}`, tag: tagX, flag: FLAG, emblem: EMBLEM });
  const Y = await api(C.token, 'POST', '/api/clubs', { name: `Chiefs ${RUN}`, tag: tagY, flag: FLAG, emblem: { icon: 'star', color: 3 } });
  await api(B.token, 'POST', `/api/clubs/${X.id}/request`);
  await api(A.token, 'POST', `/api/clubs/${X.id}/requests/${B.id}`, { accept: true });
  await api(D.token, 'POST', `/api/clubs/${Y.id}/request`);
  await api(C.token, 'POST', `/api/clubs/${Y.id}/requests/${D.id}`, { accept: true });
  check(true, `two gangs of two: [${tagX}] (A, B) and [${tagY}] (C, D)`);
  for (const p of [A, D]) await p.page.evaluate(() => window.__blatkom.app.online.refreshProfile());
  const before = await sql`SELECT id, kon_matches FROM clubs WHERE id IN ${sql([X.id, Y.id])}`;

  // ── A calls Y out from Y's page ─────────────────────────────────────────
  await A.page.getByTestId('menu-clubs').click();
  await A.page.getByTestId('club-search').fill(tagY.toLowerCase());
  await A.page.locator(`[data-testid=club-row][data-club="${Y.id}"]`).click();
  await A.page.getByTestId('club-battle').waitFor({ timeout: 20000 });
  const btn = (await A.page.getByTestId('club-battle').innerText()).replace(/\s+/g, ' ').trim();
  check(/call out to battle/i.test(btn) && btn.includes(`[${tagX}] against [${tagY}]`), `Y's page offers A «Call out to battle» («${btn}»)`);
  await A.page.getByTestId('club-battle').click();
  await A.page.getByTestId('battle-sheet').waitFor({ timeout: 10000 });
  const formats = await A.page.locator('[data-testid=battle-sheet] .battlesheet__formats button').allInnerTexts();
  check(formats.join(',') === '2×2,3×3,5×5', `the sheet offers 2×2, 3×3, 5×5 (${formats.join(', ')})`);
  await A.page.screenshot({ path: `${outDir}/battle_sheet_A.png` });
  await A.page.getByTestId('battle-go').click();
  await A.page.getByTestId('lobby-battle').waitFor({ timeout: 30000 });
  const title = (await A.page.locator('.topbar .h1').innerText()).trim();
  const vs = (await A.page.getByTestId('lobby-battle').innerText()).replace(/\s+/g, ' ').trim();
  check(/gang battle 2×2/i.test(title) && vs.includes(`[${tagX}]`) && vs.includes(`[${tagY}]`), `A's room: «${title}», «${vs}»`);
  const roomId = await A.page.evaluate(() => window.__blatkom.app.online.currentRoomId());

  // ── the call: D's card (the phone, Russian), B's and C's sockets ───────
  await D.page.locator('[data-testid=invite-card][data-battle=true]').waitFor({ timeout: 20000 });
  const card = (await D.page.getByTestId('invite-card').innerText()).replace(/\s+/g, ' ').trim();
  check(card.includes(`[${tagX}]`) && card.includes(`[${tagY}]`) && /Битва ОПГ 2×2/i.test(card) && /в бой/i.test(card), `D gets the call's card: «${card.slice(0, 100)}»`);
  await D.page.screenshot({ path: `${outDir}/battle_card_D_phone.png` });
  const [callB, callC] = await Promise.all([B.next('invite'), C.next('invite')]);
  check(callB.invite.roomId === roomId && callC.invite.battle?.blue.id === Y.id && callB.invite.battle?.red.id === X.id, 'B and C (the other gang too) hear the call live');
  await D.page.getByTestId('invite-join').click();
  await D.page.getByTestId('lobby-battle').waitFor({ timeout: 30000 });
  const [rb, rc] = [await B.enter(roomId), await C.enter(roomId)];
  check(rb.type === 'roster' && rc.type === 'roster', `B and C come in (${rb.type}, ${rc.type})`);
  await A.page.waitForFunction(() => document.querySelectorAll('.teamcol .player:not(.player--free)').length === 4, null, { timeout: 20000 });
  const sides = await A.page.evaluate(() => [...document.querySelectorAll('.teamcol')].map((col) => ({ head: col.querySelector('.teamcol__head b')?.textContent ?? '', names: [...col.querySelectorAll('.player:not(.player--free) .player__name')].map((n) => n.textContent) })));
  check(
    sides.length === 2 && sides[0].head.includes(`[${tagX}]`) && sides[1].head.includes(`[${tagY}]`) && sides[0].names.every((n) => /Warlord|Brother/.test(n)) && sides[1].names.every((n) => /Chief|Deputy/.test(n)),
    `the sides are the gangs: ${sides.map((s) => `${s.head}: ${s.names.join(', ')}`).join(' | ')}`,
  );
  check((await A.page.locator('.teamcol__join').count()) === 0, 'nobody is offered the other side');
  await A.page.screenshot({ path: `${outDir}/battle_lobby_A.png` });
  await D.page.screenshot({ path: `${outDir}/battle_lobby_D_phone.png` });
  const fits = await D.page.evaluate(() => {
    const s = document.querySelector('.ui .screen');
    return { v: s.scrollHeight - s.clientHeight, h: document.documentElement.scrollWidth - innerWidth };
  });
  check(fits.v <= 0 && fits.h <= 0, `D's phone: the battle room fits the screen (${JSON.stringify(fits)})`);

  // ── E is in no gang: the room's link turns E away ──────────────────────
  const E = await player('Eavesdropper', 'en');
  const link = await A.page.evaluate(() => window.__blatkom.app.online.inviteUrl);
  const code = /invite=([A-Za-z0-9]+)/.exec(link ?? '')?.[1];
  await E.page.goto(`${base}/?invite=${code}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await booted(E.page);
  await E.page.getByText(/only their people come in/i).waitFor({ timeout: 60000 }).catch(async (e) => {
    console.log('E sees:', (await E.page.locator('#ui').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300));
    console.log(E.log.slice(-30).join('\n'));
    await E.page.screenshot({ path: `${outDir}/battle_refused_E_fail.png`, timeout: 10000 }).catch(() => {});
    throw e;
  });
  {
    const said = (await E.page.getByText(/only their people come in/i).innerText()).replace(/\s+/g, ' ').trim();
    const retry = await E.page.getByRole('button', { name: 'Retry' }).count();
    check(said.includes(`[${tagX}]`) && said.includes(`[${tagY}]`) && retry === 0, `E (no gang) opens the link and is turned away, no «Retry» («${said}»)`);
  }
  await E.page.screenshot({ path: `${outDir}/battle_refused_E.png` });
  await E.ctx.close();

  // ── the battle ─────────────────────────────────────────────────────────
  await A.page.getByTestId('lobby-start').click();
  await A.page.waitForFunction(() => !document.querySelector('[data-testid=lobby-battle]'), null, { timeout: 30000 });
  check(true, 'A starts: the battle is on');
  await A.page.getByTestId('kon-line').waitFor({ timeout: 150000 });
  const line = (await A.page.getByTestId('kon-line').innerText()).replace(/\s+/g, ' ').trim();
  check(/Tournament rating/.test(line), `A's results: «${line}»`);
  await A.page.screenshot({ path: `${outDir}/battle_results_A.png` });
  let after = [];
  for (let i = 0; i < 20; i++) {
    after = await sql`SELECT id, kon_matches FROM clubs WHERE id IN ${sql([X.id, Y.id])}`;
    if (after.every((r) => r.kon_matches === (before.find((b) => b.id === r.id)?.kon_matches ?? 0) + 1)) break;
    await A.page.waitForTimeout(500);
  }
  check(after.length === 2 && after.every((r) => r.kon_matches === (before.find((b) => b.id === r.id)?.kon_matches ?? 0) + 1), `both gangs' tournament records count the battle (${after.map((r) => r.kon_matches).join(', ')})`);
  B.room?.close();
  C.room?.close();
  for (const p of [A, D]) {
    await p.page.getByRole('button', { name: /To menu|В меню/ }).click();
    await p.page.getByTestId('menu-nick').waitFor({ timeout: 30000 });
  }

  // ── a friend's «To battle»: D calls A to a tournament duel ─────────────
  await api(D.token, 'POST', '/api/friends/request', { name: `Warlord ${RUN}` });
  await api(A.token, 'POST', `/api/friends/${D.id}/accept`);
  await D.page.getByTestId('menu-friends').click();
  const row = D.page.locator(`[data-testid=friends-list] [data-friend="Warlord ${RUN}"]`);
  await row.getByTestId('friend-battle').click({ timeout: 30000 });
  await D.page.getByTestId('friend-battle-sheet').waitFor({ timeout: 10000 });
  const offer = await D.page.locator('[data-testid=friend-battle-sheet] .modebtn').count();
  check(offer === 5, `D's «В бой» offers the four modes and a duel (${offer})`);
  await D.page.screenshot({ path: `${outDir}/battle_friend_sheet_D_phone.png` });
  await D.page.getByTestId('friend-battle-duel').click();
  await D.page.getByTestId('friend-battle-go').click();
  await D.page.getByTestId('lobby-kon').waitFor({ timeout: 30000 });
  await A.page.getByTestId('invite-card').waitFor({ timeout: 20000 });
  await A.page.getByTestId('invite-join').click();
  await A.page.getByTestId('lobby-kon').waitFor({ timeout: 30000 });
  await D.page.waitForFunction(() => document.querySelectorAll('.teamcol .player:not(.player--free)').length === 2, null, { timeout: 20000 });
  const duel = (await A.page.locator('.topbar .h1').innerText()).trim();
  check(/1×1/.test(duel), `D's «В бой» → a duel: A came in by the card («${duel}»)`);
  // the duel's invitation is its own (A made the battle room before: its link isn't shown here)
  const inv = await A.page.evaluate(() => ({ code: document.querySelector('.lobby__invite .code')?.textContent?.trim() ?? '', url: document.querySelector('.lobby__invite')?.textContent ?? '' }));
  check(!!inv.code && inv.url.includes(`invite=${inv.code}`) && !inv.url.includes(`invite=${code}`), `A's duel room shows the duel's own link (${inv.code})`);
  await A.page.screenshot({ path: `${outDir}/battle_duel_A.png` });
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
} catch (e) {
  check(false, `battle flow: ${e.message}`);
} finally {
  for (const p of [B, C]) {
    p?.social.close();
    p?.room?.close();
  }
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[battle] ${failed.length} of ${checks.length} checks failed` : `[battle] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
