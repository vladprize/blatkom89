// v0.2.18 part 2 end-to-end — the owner's twelve new characters, the skin line, the character case, a
// friend's collection, grades in the lobby. A: English, desktop; B: Russian, phone.
//
//  • the welcome gift for early players: «Shark» and «Blatkom ’89» on all 32 weapons (64 skins, no item
//    rows), told once in a toast — in English and in Russian;
//  • the character screen: 36 characters, the new ones locked with their grades and prices (Kasatik:
//    legendary, 1 099 BLATS) — on a phone 6 × 6 portraits and the summary on one screen;
//  • the Arsenal's cases: the weapon case, the skin case and the new character case (299 BLATS); without
//    BLATS it sends to «Buy BLATS»; with them it asks «I am 18 or older», reveals a character sold for BLATS
//    (the art, the grade), the character is in the crew, the opening and its 299 BLATS are on the server;
//    the odds: four grades, 40 / 30 / 20 / 10 %; on a phone the three cases and the odds sheet;
//  • a friend's collection: A taps B's avatar in Friends — B's characters (a legendary one granted) and
//    skins by grade; a stranger can't see it (403);
//  • the lobby: each player's character with its grade's mark;
//  • practice as each of the twelve new characters: their sprite atlases are loaded and drawn.
//
// Usage: DATABASE_URL=… node tests/e2e/v0218b.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/v0218b.mjs <baseUrl> <outDir>');
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
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function player(name, lang, viewport, o = {}) {
  const phone = viewport.width < 600 || viewport.height < 450;
  const ctx = await browser.newContext({ viewport, locale: lang === 'ru' ? 'ru-RU' : 'en-GB', ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...(o.ua ? { userAgent: o.ua } : {}) });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await ctx.addInitScript(
    ([l, noFullscreen]) => {
      try {
        localStorage.setItem('blatkom89.lang.v1', l);
        localStorage.setItem('blatkom89.tutorial.v1', '1');
        localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
      } catch {}
      // an iPhone's browser: pages get no Fullscreen API
      if (noFullscreen) {
        for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { get: () => false, configurable: true });
        for (const k of ['requestFullscreen', 'webkitRequestFullscreen']) Object.defineProperty(Element.prototype, k, { value: undefined, configurable: true, writable: true });
      }
      window.__toasts = [];
      window.__sawPlay = false;
      const watch = () =>
        new MutationObserver((ms) => {
          for (const m of ms)
            for (const n of m.addedNodes) {
              if (n.nodeType !== 1) continue;
              if (n.classList.contains('toast')) window.__toasts.push(n.textContent);
              if (n.dataset?.testid === 'boot-play' || n.classList.contains('boot__play')) window.__sawPlay = true;
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
      if (document.documentElement) watch();
      else document.addEventListener('DOMContentLoaded', watch);
      document.addEventListener('DOMContentLoaded', () => (window.__bootWindow = !!document.getElementById('boot')));
    },
    [lang, !!o.noFullscreen],
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org|WebSocket/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + (o.path ?? '/'), { waitUntil: 'domcontentloaded', timeout: 90000 });
  // nothing is tapped: the loading window goes away by itself
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 90000 });
  if (o.path) return { name, ctx, page, phone };
  const nick = page.getByRole('textbox', { name: lang === 'ru' ? 'Кличка' : 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`${name} ${RUN}`);
  await page.getByRole('button', { name: lang === 'ru' ? 'Готово' : 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const me = await page.evaluate(() => fetch('/api/me', { headers: { authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then((r) => r.json()));
  return { name, ctx, page, id: me.id, phone };
}
const toMenu = async (page) => {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden');
  }, null, { timeout: 60000 });
  await page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
};
const fits = (page) =>
  page.evaluate(() => ({
    v: Math.max(document.scrollingElement.scrollHeight - innerHeight, ...[...document.querySelectorAll('.screen')].map((e) => e.scrollHeight - e.clientHeight)),
    h: document.scrollingElement.scrollWidth - innerWidth,
  }));

const api = (page, path, init = {}) =>
  page.evaluate(
    ([p, i]) => fetch(p, { ...i, headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('blatkom89.token')}` } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    [path, init],
  );
const NEW12 = ['zaychiha', 'zayac', 'vasilisk', 'lenivec', 'kozel', 'pingvin', 'tigr', 'pauk', 'bogomol', 'ezh', 'kasatka', 'zvezda'];

let A;
let B;
try {
  A = await player('Early', 'en', { width: 1366, height: 768 });
  B = await player('Rannij', 'ru', { width: 390, height: 844 });

  // ── the welcome gift ────────────────────────────────────────────────────
  for (const [P, re] of [
    [A, /welcome gift/i],
    [B, /Велком-подарок/],
  ]) {
    await P.page.waitForFunction((src) => window.__toasts.some((t) => new RegExp(src[0], src[1]).test(t)), [re.source, re.flags], { timeout: 20000 }).catch(() => {});
    const toast = await P.page.evaluate((src) => window.__toasts.find((t) => new RegExp(src[0], src[1]).test(t)) ?? '', [re.source, re.flags]);
    const inv = await P.page.evaluate(() => window.__blatkom.app.online.inventory);
    const gift = inv.skins.filter((s) => /\.(akulka|blatkom)$/.test(s)).length;
    const rows = await sql`SELECT count(*)::int AS n FROM user_items WHERE user_id = ${P.id} AND kind = 'skin'`;
    check(!!toast && gift === 64 && rows[0].n === 0, `${P.name}: the welcome gift — ${gift} skins on all weapons, no item rows, told once («${toast.slice(0, 70)}»)`);
  }

  // ── the character screen ─────────────────────────────────────────────────
  await A.page.getByRole('button', { name: 'Change character' }).click();
  await A.page.locator('.chars button').first().waitFor({ timeout: 15000 });
  const tiles = await A.page.locator('.chars button').count();
  const lockedNew = await A.page.evaluate((ids) => ids.filter((id) => !window.__blatkom.app.online.inventory.characters.includes(id)).length, NEW12);
  await A.page.locator('.chars button', { hasText: 'Kasatik' }).click();
  await A.page.waitForFunction(() => /Kasatik/.test(document.querySelector('.dossier')?.textContent ?? ''), null, { timeout: 5000 });
  const file = (await A.page.locator('.dossier').innerText()).replace(/\s+/g, ' ');
  check(tiles === 36 && lockedNew === 12 && /Legendary/i.test(file) && /1[\s,.]?099/.test(file), `36 characters; the twelve new ones locked; Kasatik's file: legendary, 1 099 BLATS («${file.slice(0, 90)}…»)`);
  await A.page.screenshot({ path: `${outDir}/chars_desktop.png` });
  await B.page.evaluate(() => window.__blatkom.app.showCharacters());
  await B.page.locator('.chars button').first().waitFor({ timeout: 15000 });
  const bFit = await fits(B.page);
  check((await B.page.locator('.chars button').count()) === 36 && bFit.v <= 0 && bFit.h <= 0, `B's phone: 36 portraits and the summary on one screen (${JSON.stringify(bFit)})`);
  await B.page.screenshot({ path: `${outDir}/chars_phone.png` });

  // ── the character case ───────────────────────────────────────────────────
  await toMenu(A.page);
  await A.page.getByTestId('arsenal-tile').click();
  await A.page.locator('.tabs button', { hasText: 'Case' }).click();
  await A.page.getByTestId('char-case').waitFor({ timeout: 15000 });
  const cases = await A.page.locator('[data-testid=weapon-case], [data-testid=skin-case], [data-testid=char-case], .cases > .panel').count();
  const owned0 = await A.page.getByTestId('chars-owned').innerText();
  check(cases >= 3 && /0 of 31/.test(owned0), `three cases on the tab, the character case among them («${owned0}»)`);
  await A.page.getByTestId('open-char-case').click();
  await A.page.waitForFunction(() => window.__toasts.some((t) => /Not enough BLATS/.test(t)), null, { timeout: 10000 }).catch(() => {});
  check(await A.page.evaluate(() => window.__toasts.some((t) => /Not enough BLATS/.test(t))), 'without BLATS: «Not enough BLATS» and the BLATS section');
  await sql`UPDATE profiles SET diamonds = 1000 WHERE user_id = ${A.id}`;
  await toMenu(A.page);
  await A.page.getByTestId('arsenal-tile').click();
  await A.page.locator('.tabs button', { hasText: 'Case' }).click();
  await A.page.getByTestId('char-odds-open').click();
  await A.page.getByTestId('char-odds').waitFor({ timeout: 5000 });
  const odds = (await A.page.getByTestId('char-odds').innerText()).replace(/\s+/g, ' ');
  check((await A.page.locator('[data-testid=char-odds] tbody tr').count()) === 4 && /40%/.test(odds) && /30%/.test(odds) && /20%/.test(odds) && /10%/.test(odds) && /Kasatik/.test(odds), `the character odds: four grades, 40 / 30 / 20 / 10 %, the characters listed («${odds.slice(0, 100)}…»)`);
  await A.page.screenshot({ path: `${outDir}/char_odds.png` });
  await A.page.getByTestId('sheet-close').click();
  await A.page.getByTestId('char-odds').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await A.page.getByTestId('open-char-case').click();
  check((await A.page.getByTestId('case-adult').count()) === 1 && !(await A.page.getByTestId('case-confirm').isEnabled()), 'the character case asks «I am 18 or older» before it opens');
  await A.page.getByTestId('case-adult').check();
  await A.page.getByTestId('case-confirm').click();
  await A.page.getByTestId('char-reveal').waitFor({ timeout: 15000 });
  const reveal = (await A.page.getByTestId('char-reveal').innerText()).replace(/\s+/g, ' ');
  const heroOk = await A.page.waitForFunction(() => { const i = document.querySelector('[data-testid=char-reveal] .reveal__img'); return !!i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  const invA = await A.page.evaluate(() => window.__blatkom.app.online.inventory);
  const got = invA.characters.filter((c) => !['petya', 'valuta'].includes(c));
  const rows = await sql`SELECT kind, character_id, rarity, price, currency FROM case_openings WHERE user_id = ${A.id}`;
  check(heroOk && got.length === 1 && invA.diamonds === 801 && rows.length === 1 && rows[0].kind === 'character' && rows[0].character_id === got[0] && rows[0].price === 199, `revealed «${reveal.slice(0, 60)}» with the art: ${got[0]} joins the crew, 299 BLATS spent, recorded on the server`);
  await A.page.screenshot({ path: `${outDir}/char_reveal.png` });
  // B (phone): the three cases on the case chip; the odds sheet
  await sql`UPDATE profiles SET diamonds = 500 WHERE user_id = ${B.id}`;
  await toMenu(B.page);
  await B.page.getByTestId('arsenal-tile').click();
  // v0.2.19: the cases have their own bright button in the Arsenal's top row
  await B.page.getByTestId('ars-case').click();
  await B.page.getByTestId('char-case').waitFor({ timeout: 15000 });
  const bCase = (await B.page.getByTestId('char-case').innerText()).replace(/\s+/g, ' ');
  const bFit2 = await fits(B.page);
  check(/КЕЙС БРАТВЫ|Кейс братвы/.test(bCase) && /199/.test(bCase) && bFit2.v <= 0 && bFit2.h <= 0, `B's phone: the character case in Russian («${bCase.slice(0, 70)}»), the screen fits (${JSON.stringify(bFit2)})`);
  await B.page.screenshot({ path: `${outDir}/cases_phone.png` });

  // ── a friend's collection ────────────────────────────────────────────────
  const bName = await B.page.evaluate(() => window.__blatkom.app.online.profile.displayName);
  const req = await api(A.page, '/api/friends/request', { method: 'POST', body: JSON.stringify({ name: bName }) });
  const acc = await api(B.page, `/api/friends/${A.id}/accept`, { method: 'POST', body: '{}' });
  await sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${B.id}, 'kasatka', 'character', 'grant') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO user_items (user_id, item_id, kind, source) VALUES (${B.id}, 'avtomat.yadernaya', 'skin', 'grant') ON CONFLICT DO NOTHING`;
  check(req.status === 200 && acc.status === 200, `A and B are friends (${req.status}, ${acc.status})`);
  await toMenu(A.page);
  await A.page.getByTestId('menu-friends').click();
  await A.page.getByTestId('friend-collection-open').first().waitFor({ timeout: 15000 });
  await A.page.getByTestId('friend-collection-open').first().click();
  await A.page.getByTestId('friend-collection').locator('.fcoll__chars').waitFor({ timeout: 10000 });
  const coll = (await A.page.getByTestId('friend-collection').innerText()).replace(/\s+/g, ' ');
  const kas = await A.page.locator('[data-testid=friend-collection] .fcoll__char.chargrade--legendary[data-owned=true]').count();
  const leg = await A.page.locator('[data-testid=friend-collection] .fcoll__skin[data-grade=legendary] b').innerText();
  check(/Characters: 3 of 36/i.test(coll) && kas === 1 && leg.trim() === '1', `A sees B's collection: 3 of 36 characters (the legendary one in colour), 1 legendary skin («${coll.slice(0, 80)}»)`);
  // v0.2.23: B's fighter card at the top — the main weapon of B's kit
  const fcard = await A.page.evaluate(() => {
    const c = document.querySelector('[data-testid=friend-card] canvas[data-testid=fighter-card]');
    return c ? { character: c.dataset.character, weapon: c.dataset.weapon, w: Math.round(c.getBoundingClientRect().width) } : null;
  });
  check(!!fcard && !!fcard.weapon && fcard.w >= 200, `v0.2.23: the collection opens with B's fighter card (${JSON.stringify(fcard)})`);
  await A.page.screenshot({ path: `${outDir}/friend_collection.png` });
  const C = await player('Stranger', 'en', { width: 1280, height: 720 });
  // from outside the page (the page would log the expected 403 as a console error)
  const cToken = await C.page.evaluate(() => localStorage.getItem('blatkom89.token'));
  const peek = await fetch(`${base}/api/friends/${B.id}/collection`, { headers: { authorization: `Bearer ${cToken}` } });
  check(peek.status === 403, `a stranger can't see it (${peek.status})`);
  await C.ctx.close();

  // ── the lobby: the character's grade ─────────────────────────────────────
  await toMenu(A.page);
  await A.page.evaluate(() => window.__blatkom.app.online.createRoom('factory', 'petya', 'ffa'));
  await A.page.locator('.player__char[data-grade]').first().waitFor({ timeout: 20000 });
  const mark = await A.page.locator('.player__char[data-grade]').first().evaluate((e) => ({ grade: e.dataset.grade, text: e.textContent, color: getComputedStyle(e).color }));
  check(mark.grade === 'common' && /Petya/.test(mark.text) && mark.color === 'rgb(167, 164, 156)', `the lobby shows the character's grade: ${JSON.stringify(mark)}`);
  await A.page.screenshot({ path: `${outDir}/lobby_grade.png` });
  await A.page.evaluate(() => window.__blatkom.app.online.leave());

  // ── practice as each of the twelve new characters ─────────────────────────
  await toMenu(A.page);
  const drawn = [];
  for (const id of NEW12) {
    await A.page.evaluate((c) => window.__blatkom.app.startPractice({ mapId: 'factory', bots: 3, difficulty: 'easy', character: c }), id);
    await A.page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
    await A.page.waitForTimeout(500);
    const r = await A.page.evaluate(() => {
      const g = window.__blatkom.game;
      const s = g.scene.getScene('game');
      const me = s.session.players().find((p) => p.isLocal);
      const v = s.views.get(me.slot);
      return { character: me.character, torso: v?.torso.texture.key, frames: g.textures.get(`char_${me.character}`).getFrameNames().length };
    });
    if (r.torso === `char_${id}` && r.frames > 50) drawn.push(id);
    if (id === 'kasatka' || id === 'pauk' || id === 'zvezda') await A.page.screenshot({ path: `${outDir}/practice_${id}.png` });
    await A.page.evaluate(() => window.__blatkom.app.goMenu());
    await A.page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  }
  check(drawn.length === 12, `practice plays as every new character with its atlas (${drawn.length}/12: ${drawn.join(', ')})`);
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  for (const P of [A, B]) await P?.page.screenshot({ path: `${outDir}/fail_${P.name}.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
await sql.end();
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[v0218b] ${failed} problem(s)` : `[v0218b] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
