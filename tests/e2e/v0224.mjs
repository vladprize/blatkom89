// v0.2.24 — the owner's edits of 10 November 2026, end to end on the production bundle:
//   the fighter cards in new places — the menu (a computer: the card's own column; a phone: the small card by
//   the character's name), the wait for a match (the player's card while the server finds a room), the lobby's
//   «Бойцы» (everyone in the room as cards; the room still fits the window);
//   the legendary characters move like the legendary skins — their card is redrawn (a plain one stands still),
//   a halo at their feet in a match;
//   the Season Pass — the card in the cases (the season's weeks and dates), bought for 299 BLATS with the 18+
//   confirmation, the weeks gone by opened at once (a fighter card a week: the new character holding the new
//   skin), the weeks' track after; a phone whose pass has ready weeks — the menu's mark, the tile straight to
//   the cases, the weeks opened there;
//   the leftovers — the legendary skin's «★ N» on the match HUD's weapon panel, a phone's targets 44 px to a
//   finger (the lobby's quick lines, the sliders, the profile's tabs), a computer window of 800×600 (the
//   characters and the practice screen without scrolling); the story hub on a phone held sideways (its missions
//   in view — the first full run found them 0 px tall).
// The runner's server has a season started eight days ago (PASS_SEASON_* — the production one is the owner's
// to set). BLATS are granted straight in the test database (DATABASE_URL).
// Usage: DATABASE_URL=… node tests/e2e/v0224.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/v0224.mjs <baseUrl> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sql = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const checks = [];
const problems = [];
const check = (ok, what) => {
  checks.push({ ok: !!ok, what });
  console.log(ok ? '✔' : '✖', what);
};
const RUN = Math.random().toString(36).slice(2, 6);
let n = 0;
/** The screenshots go to the owner: without the sign-up's passing notes or the mouse resting on something. */
const quiet = new WeakSet();
async function shot(page, name) {
  if (!quiet.has(page)) {
    quiet.add(page);
    await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' }).catch(() => {});
  }
  await page.mouse.move(1, 1).catch(() => {});
  await page.screenshot({ path: `${outDir}/${name}` });
}

/** A guest who has played before (no first-match hints or windows), with an alias; their user id. */
async function open(viewport, o = {}) {
  const phone = !!o.phone;
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.story.prologue.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      localStorage.setItem('blatkom89.matches-done.v1', '3');
      localStorage.setItem('blatkom89.hints.v1', '9');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  const nick = page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`v24_${RUN}_${++n}`);
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { ctx, page, id: me.id };
}
const rect = (page, sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), inView: r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  }, sel);
const fits = (page) =>
  page.evaluate(() => {
    const s = document.querySelector('.ui .screen');
    return { v: s ? s.scrollHeight - s.clientHeight : 0, h: document.documentElement.scrollWidth - innerWidth };
  });
const authed = (page, path, init = {}) =>
  page.evaluate(
    ([p, i]) => fetch(p, { ...i, headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    [path, init],
  );

let failed = false;
try {
  // ── the menu: the card's own column (a computer), the small card by the name (a phone) ─────────────
  const A = await open({ width: 1280, height: 720 });
  await A.page.waitForSelector('[data-testid=menu-hero] canvas[data-testid=fighter-card]', { timeout: 15000 });
  const hero = await rect(A.page, '[data-testid=menu-hero] canvas[data-testid=fighter-card]');
  const heroFull = await A.page.evaluate(() => document.querySelector('[data-testid=menu-hero] canvas')?.dataset.character);
  check(!!hero && hero.inView && hero.w >= 160 && hero.h >= hero.w * 1.3, `a computer's menu: the fighter card in its own column, whole and in view (${JSON.stringify(hero)}, ${heroFull})`);
  const mf = await fits(A.page);
  check(mf.v <= 2 && mf.h <= 0, `the menu still fits the window (${JSON.stringify(mf)})`);
  await shot(A.page, `pc_menu.png`);
  await A.page.getByTestId('menu-hero').click();
  await A.page.getByTestId('card-viewer').waitFor({ timeout: 10000 });
  check(true, 'a tap on the menu\'s card opens it big');
  await A.page.keyboard.press('Escape');

  // ── the wait for a match, then the quick-match lobby with «Бойцы» ────────────────────────────────
  await A.page.route('**/api/rooms/quick', async (route) => {
    await new Promise((r) => setTimeout(r, 3500));
    await route.continue().catch(() => {});
  });
  await A.page.getByRole('button', { name: /Быстрый матч/i }).first().click();
  const ffa = A.page.locator('[data-mode=ffa]').first();
  await ffa.waitFor({ timeout: 5000 }).catch(() => {});
  if (await ffa.count()) await ffa.click();
  await A.page.getByTestId('match-wait').waitFor({ timeout: 8000 });
  await A.page.waitForTimeout(700);
  const wait = await rect(A.page, '[data-testid=wait-card] canvas[data-testid=fighter-card]');
  const waitText = (await A.page.getByTestId('match-wait').innerText()).replace(/\s+/g, ' ').trim();
  check(!!wait && wait.inView && wait.w >= 150 && /Ищем матч|Ищем, кому/.test(waitText), `the wait for a match: the player's card and «${waitText}» (${JSON.stringify(wait)})`);
  await shot(A.page, `pc_wait.png`);
  await A.page.waitForSelector('[data-testid=lobby-cards] canvas[data-testid=fighter-card]', { timeout: 30000 });
  await A.page.unroute('**/api/rooms/quick');
  await A.page.waitForTimeout(600);
  const lob = await A.page.evaluate(() => {
    const row = document.querySelector('[data-testid=lobby-cards]');
    const cs = [...row.querySelectorAll('canvas')].map((c) => Math.round(c.getBoundingClientRect().width));
    const right = document.querySelector('.lobby__col--right');
    return { cards: cs, off: row.parentElement.classList.contains('cardpanel--off'), rightOver: right.scrollHeight - right.clientHeight };
  });
  check(lob.cards.length === 1 && lob.cards[0] >= 80 && !lob.off && lob.rightOver <= 0, `the quick-match lobby: «Бойцы» with the player's card, the right column not scrolling (${JSON.stringify(lob)})`);
  await shot(A.page, `pc_lobby.png`);
  await A.page.evaluate(() => window.__blatkom.app.online.leave?.());
  await A.ctx.close();

  // the phone: the menu's small card, the lobby's fighters (the room fits the screen)
  const P = await open({ width: 390, height: 844 }, { phone: true });
  // v0.2.25 (the owner: «на мобилке карточка доминантная, без ячейки»): the card beside the Arsenal and the dossier
  const mini = await rect(P.page, '[data-testid=menu-card] canvas[data-testid=fighter-card]');
  check(!!mini && mini.inView && mini.w >= 110, `a phone's menu: the fighter card, big, beside the Arsenal (${JSON.stringify(mini)})`);
  await shot(P.page, `phone_menu.png`);
  await P.page.evaluate(() => window.__blatkom.app.online.createRoom('factory', 'petya', 'ffa'));
  await P.page.waitForSelector('[data-testid=lobby-cards] canvas[data-testid=fighter-card]', { timeout: 30000 });
  await P.page.waitForTimeout(600);
  const plob = await P.page.evaluate(() => {
    const row = document.querySelector('[data-testid=lobby-cards]');
    return { cards: [...row.querySelectorAll('canvas')].map((c) => Math.round(c.getBoundingClientRect().width)), off: row.parentElement.classList.contains('cardpanel--off') };
  });
  const pf = await fits(P.page);
  check(plob.cards.length === 1 && plob.cards[0] >= 50 && !plob.off && pf.v <= 0 && pf.h <= 0, `a phone's room: the fighters' card shown and the room on one screen (${JSON.stringify({ ...plob, ...pf })})`);
  await shot(P.page, `phone_lobby.png`);
  await P.page.evaluate(() => window.__blatkom.app.online.leave?.());
  await P.ctx.close();

  // ── legendary characters move ──────────────────────────────────────────────────────────────────
  const L = await open({ width: 1280, height: 720 });
  const poster = async (c) => {
    await L.page.evaluate((ch) => {
      const app = window.__blatkom.app;
      app.character = ch;
      app.showArsenal(false, 'loadout', { weapon: 'avtomat', finish: null });
    }, c);
    await L.page.waitForSelector('[data-testid=dressing-room] canvas[data-testid=fighter-card]', { timeout: 20000 });
    await L.page.waitForTimeout(1200);
    const a = await L.page.evaluate(() => document.querySelector('[data-testid=dressing-room] canvas[data-testid=fighter-card]').toDataURL());
    await L.page.waitForTimeout(450);
    const b = await L.page.evaluate(() => document.querySelector('[data-testid=dressing-room] canvas[data-testid=fighter-card]').toDataURL());
    return a !== b;
  };
  const legendMoves = await poster('kasatka');
  await shot(L.page, `pc_legend_card.png`);
  const plainMoves = await poster('uchastkovy');
  check(legendMoves && !plainMoves, `a legendary character's card moves (Касатик: ${legendMoves}), a plain one with a plain weapon stands still (Участковый: ${plainMoves})`);
  await L.page.evaluate(() => window.__blatkom.app['startPractice']({ mapId: 'factory', bots: 1, difficulty: 'easy', gameMode: 'ffa', character: 'zvezda' }));
  await L.page.waitForFunction(() => window.__blatkom.app.session?.world?.phase === 'active', null, { timeout: 30000 });
  await L.page.waitForTimeout(1200);
  const halo = await L.page.evaluate(() => {
    const sc = window.__blatkom.game.scene.getScene('game');
    const me = sc.session.players().find((p) => p.isLocal);
    const v = sc.views.get(me.slot);
    return { character: me.character, halo: !!v?.halo && v.halo.visible, alpha: v?.halo ? Math.round(v.halo.alpha * 100) / 100 : null };
  });
  check(halo.character === 'zvezda' && halo.halo && halo.alpha > 0.1, `in a match a legendary character has a halo at its feet (${JSON.stringify(halo)})`);
  await L.page.evaluate(() => window.__blatkom.app.goMenu());
  await L.ctx.close();

  // ── the Season Pass on a computer ─────────────────────────────────────────────────────────────────
  const cfg = await (await fetch(`${base}/api/shop/config`)).json();
  check(!!cfg.pass && cfg.pass.weeks === 4 && Date.parse(cfg.pass.start) < Date.now() && Date.parse(cfg.pass.end) > Date.now(), `the server's season is in the shop config (${JSON.stringify(cfg.pass)})`);
  const season = cfg.pass?.id ?? 'e2e';
  const B = await open({ width: 1280, height: 720 });
  await sql`UPDATE profiles SET diamonds = diamonds + 400 WHERE user_id = ${B.id}`;
  await B.page.evaluate(() => window.__blatkom.app.showArsenal(true, 'case'));
  await B.page.getByTestId('pass-buy').waitFor({ timeout: 20000 });
  const card = await B.page.evaluate(() => ({
    text: document.querySelector('[data-testid=pass-card]').innerText.replace(/\s+/g, ' '),
    weeks: [...document.querySelectorAll('[data-testid=pass-weeks] .passweek')].map((w) => w.dataset.state),
  }));
  check(/299/.test(card.text) && /каждую неделю/i.test(card.text) && JSON.stringify(card.weeks) === JSON.stringify(['later', 'later', 'later', 'later']), `the pass's card in the cases: the price, a skin and a character a week, the four weeks with their dates («${card.text.slice(0, 120)}»)`);
  await shot(B.page, `pc_pass_card.png`);
  await B.page.getByTestId('pass-buy').click();
  const confirmBtn = B.page.getByTestId('case-confirm');
  check(await confirmBtn.isDisabled(), 'buying asks for the 18+ confirmation first');
  await B.page.getByTestId('case-adult').check();
  await confirmBtn.click();
  await B.page.getByTestId('pass-reveal').waitFor({ timeout: 30000 });
  await B.page.waitForTimeout(1200);
  const rev = await B.page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=pass-reveal] .passdrop')].map((d) => ({ week: d.dataset.week, card: d.querySelector('canvas')?.dataset.character, finish: d.querySelector('canvas')?.dataset.finish, text: d.innerText.replace(/\s+/g, ' ') })),
  );
  check(rev.length === 2 && rev[0].week === '1' && rev[1].week === '2' && rev.every((r) => r.card && r.finish), `bought in its second week: weeks 1 and 2 open at once, each a fighter card — the new character with the new skin (${JSON.stringify(rev)})`);
  await shot(B.page, `pc_pass_reveal.png`);
  await B.page.getByTestId('sheet-close').click();
  await B.page.waitForTimeout(500);
  const after = await B.page.evaluate(() => [...document.querySelectorAll('[data-testid=pass-weeks] .passweek')].map((w) => w.dataset.state));
  const next = await B.page.getByTestId('pass-next').innerText().catch(() => '');
  check(JSON.stringify(after) === JSON.stringify(['open', 'open', 'later', 'later']) && /следующая неделя/i.test(next), `after: weeks 1–2 opened, 3–4 to come (${JSON.stringify(after)}, «${next.trim()}»)`);
  const drops = await sql`SELECT week, skin_id, character_id, blats FROM pass_drops WHERE user_id = ${B.id} ORDER BY week`;
  const items = await sql`SELECT kind, item_id FROM user_items WHERE user_id = ${B.id} AND source = 'pass'`;
  const led = await sql`SELECT delta, reason, ref FROM currency_ledger WHERE user_id = ${B.id} AND reason = 'purchase'`;
  check(
    drops.length === 2 && items.length === 4 && led.length === 1 && led[0].delta === -299 && led[0].ref === `pass:${season}`,
    `the server filed two weeks, four items and one purchase of 299 (${JSON.stringify({ drops: drops.map((d) => `${d.week}:${d.character_id}+${d.skin_id}`), led })})`,
  );
  const again = await authed(B.page, '/api/pass/buy', { method: 'POST', body: JSON.stringify({ confirmAge: true }) });
  check(again.status === 409 && again.body?.error?.code === 'owned', `one pass a season (${again.status} ${again.body?.error?.code})`);
  await shot(B.page, `pc_pass_after.png`);
  await B.ctx.close();

  // ── a phone with ready weeks: the menu's mark, the tile to the cases, the weeks opened there ───────
  const Q = await open({ width: 390, height: 844 }, { phone: true });
  await sql`UPDATE profiles SET diamonds = diamonds + 299 WHERE user_id = ${Q.id}`;
  const bought = await authed(Q.page, '/api/pass/buy', { method: 'POST', body: JSON.stringify({ confirmAge: true }) });
  check(bought.status === 200 && bought.body?.state?.ready === 2, `bought without opening: two weeks ready (${bought.status}, ready ${bought.body?.state?.ready})`);
  await Q.page.reload();
  await Q.page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  await Q.page.getByTestId('pass-ready').waitFor({ timeout: 20000 });
  const mark = (await Q.page.getByTestId('pass-ready').innerText()).trim();
  check(/2/.test(mark), `the menu marks the Arsenal: «${mark}»`);
  await shot(Q.page, `phone_pass_mark.png`);
  await Q.page.getByTestId('arsenal-tile').click();
  await Q.page.getByTestId('pass-claim').waitFor({ timeout: 20000 });
  check(true, 'the tile opens the cases, the pass\'s «open» button there');
  await shot(Q.page, `phone_pass_card.png`);
  await Q.page.getByTestId('pass-claim').click();
  await Q.page.getByTestId('pass-reveal').waitFor({ timeout: 30000 });
  await Q.page.waitForTimeout(1000);
  const qn = await Q.page.locator('[data-testid=pass-reveal] .passdrop').count();
  const qside = await Q.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(qn === 2 && qside <= 0, `the phone opens both weeks, the sheet no wider than the screen (${qn}, ${qside})`);
  await shot(Q.page, `phone_pass_reveal.png`);
  await Q.ctx.close();
  // ── the leftovers: the HUD's «★ N», a phone's 44 px targets, an 800×600 window ───────────────────────
  const H = await open({ width: 1280, height: 720 });
  await H.page.evaluate(() => window.__blatkom.app['startPractice']({ mapId: 'factory', bots: 1, difficulty: 'easy', gameMode: 'ffa', tryOn: { weapon: 'avtomat', finish: 'bratok', mods: [] } }));
  await H.page.waitForFunction(() => window.__blatkom.app.session?.world?.phase === 'active', null, { timeout: 30000 });
  await H.page.waitForTimeout(1200);
  const star = await H.page.evaluate(() => {
    const hud = window.__blatkom.game.scene.getScene('hud');
    const c = hud.skinCounter;
    const me = window.__blatkom.app.session.players().find((p) => p.isLocal);
    return { text: c?.text ?? null, visible: !!c?.visible, skin: me?.skin ?? null };
  });
  check(star.skin === 'bratok' && /^★ \d+$/.test(star.text ?? '') && star.visible, `the match HUD's weapon panel shows a legendary skin's eliminations (${JSON.stringify(star)})`);
  await shot(H.page, `pc_hud_star.png`);
  await H.page.evaluate(() => window.__blatkom.app.goMenu());
  await H.ctx.close();

  // a phone held sideways: the lobby's ready-made lines and the chat field; upright: the sliders, the profile's tabs
  const S = await open({ width: 844, height: 390 }, { phone: true });
  await S.page.evaluate(() => window.__blatkom.app.online.createRoom('factory', 'petya', 'ffa'));
  await S.page.waitForSelector('.rchat__quick .chip', { timeout: 30000 });
  await S.page.waitForTimeout(500);
  const chips = await S.page.evaluate(() => ({
    chips: [...document.querySelectorAll('.rchat__quick .chip')].filter((c) => c.getBoundingClientRect().width > 0).map((c) => Math.round(c.getBoundingClientRect().height)),
    input: Math.round(document.querySelector('.rchat__input')?.getBoundingClientRect().height ?? 0),
  }));
  const sf = await fits(S.page);
  check(chips.chips.length > 0 && chips.chips.every((h) => h >= 44) && chips.input >= 44, `a phone sideways, the lobby: the ready-made lines and the chat field 44 px and more to a finger (${JSON.stringify(chips)}, page ${JSON.stringify(sf)})`);
  await shot(S.page, `phone_land_lobby.png`);
  await S.page.evaluate(() => window.__blatkom.app.online.leave?.());
  await S.page.evaluate(() => window.__blatkom.app.goMenu());
  await S.page.evaluate(() => window.__blatkom.app.open('profile'));
  await S.page.waitForSelector('.panetabs button', { timeout: 15000 });
  await S.page.waitForTimeout(500);
  const ltabs = await S.page.evaluate(() => [...document.querySelectorAll('.panetabs button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => Math.round(b.getBoundingClientRect().height)));
  const lpf = await fits(S.page);
  check(ltabs.length > 0 && ltabs.every((h) => h >= 44) && lpf.v <= 0, `a phone sideways, the profile: its tabs 44 px tall, the screen still one view (${JSON.stringify(ltabs)}, ${JSON.stringify(lpf)})`);
  // the story hub sideways: the campaign the story's whole width, its missions in view (they had 0 px before),
  // «Пролог» and «Картотека» in the tabs' row, one screen
  await S.page.evaluate(() => window.__blatkom.app.goMenu());
  await S.page.evaluate(() => window.__blatkom.app.story.show(true));
  await S.page.waitForSelector('.screen--story .smissions', { timeout: 20000 });
  await S.page.waitForTimeout(800);
  const lstory = await S.page.evaluate(() => {
    const story = document.querySelector('.screen--story .story').getBoundingClientRect();
    const camp = [...document.querySelectorAll('.screen--story .scamp')].find((e) => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
    const list = [...document.querySelectorAll('.screen--story .smissions')].find((e) => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
    const tab = document.querySelector('.screen--story .panetabs').getBoundingClientRect();
    const pro = document.querySelector('[data-testid=story-prologue]').getBoundingClientRect();
    return { wide: camp ? Math.round((camp.width / story.width) * 100) : 0, list: list ? Math.round(list.height) : 0, row: Math.abs(Math.round(pro.top - tab.top)) };
  });
  const lsf = await fits(S.page);
  check(lstory.wide >= 95 && lstory.list >= 120 && lstory.row <= 2 && lsf.v <= 0 && lsf.h <= 0, `a phone sideways, the story: the campaign the hub's width, its missions in view, «Пролог» beside the tabs, one screen (${JSON.stringify(lstory)}, ${JSON.stringify(lsf)})`);
  await shot(S.page, `phone_land_story.png`);
  await S.ctx.close();
  const U = await open({ width: 390, height: 664 }, { phone: true });
  await U.page.evaluate(() => window.__blatkom.app.open('settings'));
  await U.page.waitForSelector('.range', { timeout: 15000 });
  await U.page.waitForTimeout(500);
  const sliders = await U.page.evaluate(() => [...document.querySelectorAll('.range')].filter((r) => r.getBoundingClientRect().width > 0).map((r) => Math.round(r.getBoundingClientRect().height)));
  const uf = await fits(U.page);
  check(sliders.length > 0 && sliders.every((h) => h >= 44) && uf.v <= 0, `a 390×664 phone, the settings: the sliders 44 px tall, the screen one view (${JSON.stringify(sliders)}, ${JSON.stringify(uf)})`);
  await shot(U.page, `phone_settings.png`);
  await U.page.evaluate(() => window.__blatkom.app.goMenu());
  await U.page.evaluate(() => window.__blatkom.app.open('profile'));
  await U.page.waitForSelector('.panetabs button', { timeout: 15000 });
  await U.page.waitForTimeout(400);
  const utabs = await U.page.evaluate(() => [...document.querySelectorAll('.panetabs button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => Math.round(b.getBoundingClientRect().height)));
  check(utabs.length > 0 && utabs.every((h) => h >= 44), `upright, the profile's tabs 44 px tall (${JSON.stringify(utabs)})`);
  await U.ctx.close();

  // a computer window of 800×600: the menu, the characters, practice (and play with friends, the tournament) on one screen
  const W8 = await open({ width: 800, height: 600 });
  const small = {};
  for (const scr of ['menu', 'characters', 'practice', 'friends', 'kon']) {
    if (scr !== 'menu') await W8.page.evaluate((x) => window.__blatkom.app.open(x), scr);
    await W8.page.waitForTimeout(1200);
    small[scr] = (await fits(W8.page)).v;
    await shot(W8.page, `pc800_${scr}.png`);
    if (scr !== 'menu') await W8.page.evaluate(() => window.__blatkom.app.goMenu());
  }
  check(Object.values(small).every((v) => v <= 0), `an 800×600 window: the menu, the characters, practice, play with friends and the tournament without scrolling (${JSON.stringify(small)})`);
  await W8.ctx.close();
} catch (e) {
  failed = true;
  console.error('✖ v0.2.24 e2e crashed:', e?.stack ?? e);
}
await browser.close();
await sql.end();
for (const p of problems) console.log('✖ page error:', p);
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n[v0.2.24] ${checks.length - bad}/${checks.length} checks passed${problems.length ? `, ${problems.length} page errors` : ''}`);
process.exit(failed || bad || problems.length ? 1 : 0);
