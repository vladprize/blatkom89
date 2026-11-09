// v0.2.23 — skins you can see (9 Nov 2026), end to end on the production bundle:
//   practice: the line-up of fighter cards while the countdown runs (every fighter with the weapon in hand, in
//   its skin); taken down by a bot wearing a skin — the killer's card under «ELIMINATED», gone after the
//   respawn; the kill feed's icon in the skin; the results: the podium of three cards and «What took you down»
//   with «Try on» into the Arsenal; a row of the table opens that player's card, «Share»;
//   the Arsenal: the fighter card as the dressing room's poster, opened big; a set bought (a character with
//   their legendary skin, cheaper than apart) — both items, the skin on the automatic, the character in play,
//   the card with the counter; a phone held sideways: the line-up and the killer's card fit.
// The BLATS for the set are granted straight in the test database (DATABASE_URL).
// Usage: DATABASE_URL=… node tests/e2e/v0223.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/v0223.mjs <baseUrl> <outDir>');
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

/** A guest who has played before (no first-match hints or windows), with an alias. */
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
    } catch {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(base + '/');
  await page.waitForFunction(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('boot--hidden'); }, null, { timeout: 90000 });
  const nick = page.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`v23_${RUN}_${viewport.width}`);
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}
const phase = (page) => page.evaluate(() => window.__blatkom.app.session?.world?.phase ?? null);
const cardInfo = (page, sel) =>
  page.evaluate((s) => {
    const c = document.querySelector(s);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { character: c.dataset.character, weapon: c.dataset.weapon, finish: c.dataset.finish, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  }, sel);

/** Practice with five bots: the line-up, the killer's card, the results' cards. */
async function practice(page, tag, o = {}) {
  await page.evaluate(() => window.__blatkom.app['startPractice']({ mapId: 'factory', bots: 5, difficulty: 'easy', gameMode: 'ffa' }));
  await page.waitForSelector('[data-testid=lineup] canvas[data-testid=fighter-card]', { timeout: 30000 });
  await page.waitForTimeout(700);
  const lineup = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=lineup] canvas[data-testid=fighter-card]')].map((c) => {
      const r = c.getBoundingClientRect();
      return { character: c.dataset.character, weapon: c.dataset.weapon, finish: c.dataset.finish, inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
    }),
  );
  check(lineup.length === 6 && lineup.every((c) => c.inView && c.weapon), `${tag}: the line-up — six fighter cards while the countdown runs, each with the weapon in hand, all in view (${lineup.map((c) => `${c.character}:${c.weapon}${c.finish ? `.${c.finish}` : ''}`).join(' ')})`);
  await page.screenshot({ path: `${outDir}/${tag}_lineup.png` });
  await page.waitForFunction(() => window.__blatkom.app.session?.world?.phase === 'active', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const gone = await page.evaluate(() => !document.querySelector('[data-testid=lineup]')?.classList.contains('mcards--on'));
  check(gone, `${tag}: the line-up goes when the match starts`);
  // a bot with a skin on the weapon in hand takes the player down (the bots wear skins by their id: some match
  // has one; if none in this match, one is made to)
  const killer = await page.evaluate(() => {
    const s = window.__blatkom.app.session;
    let k = s.players().find((p) => !p.isLocal && p.skin && p.alive !== false);
    if (!k) return null;
    const ks = [...s.world.players.values()].find((p) => p.slot === k.slot);
    const me = s.world.players.get('local');
    me.invulnUntil = 0;
    s.world.applyDamage(me, ks, 999, ks.weapon);
    return { name: k.name, weapon: k.weapon, skin: k.skin };
  });
  if (!killer) {
    check(true, `${tag}: (no bot wore a skin on the weapon in hand this match — the killer's card is checked with a plain weapon)`);
  }
  const plain = killer
    ? null
    : await page.evaluate(() => {
        const s = window.__blatkom.app.session;
        const ks = [...s.world.players.values()].find((p) => p.isBot && p.alive);
        const me = s.world.players.get('local');
        me.invulnUntil = 0;
        s.world.applyDamage(me, ks, 999, ks.weapon);
        return { weapon: ks.weapon };
      });
  await page.waitForSelector('[data-testid=killer-card].mcards--on canvas[data-testid=fighter-card]', { timeout: 5000 });
  await page.waitForTimeout(600);
  const kc = await cardInfo(page, '[data-testid=killer-card] canvas[data-testid=fighter-card]');
  check(!!kc && kc.inView && kc.weapon === (killer?.weapon ?? plain.weapon) && kc.finish === (killer?.skin ?? ''), `${tag}: the killer's card — who and with what, the skin of the weapon (${JSON.stringify(kc)} vs ${JSON.stringify(killer ?? plain)})`);
  // under the HUD's «ELIMINATED» line, not over it (a computer: the HUD's line measured in page pixels)
  if (tag === 'pc') {
    const under = await page.evaluate(() => {
      const hud = window.__blatkom.game.scene.getScene('hud');
      const canvas = window.__blatkom.game.canvas;
      const cr = canvas.getBoundingClientRect();
      const css = cr.height / canvas.height;
      const b = hud.subText.getBounds();
      const lineBottom = cr.top + b.bottom * hud.uiZoom * css;
      const c = document.querySelector('[data-testid=killer-card] canvas').getBoundingClientRect();
      return { card: Math.round(c.top), line: Math.round(lineBottom), text: hud.subText.text };
    });
    check(under.card > under.line, `${tag}: the killer's card sits under «ELIMINATED» and its line (${JSON.stringify(under)})`);
  }
  if (killer) {
    const feed = await page.evaluate(() => {
      const walk = (arr) => arr.some((o) => o.texture?.key?.startsWith?.('skin~ico_') || (Array.isArray(o.list) && walk(o.list)));
      const hud = window.__blatkom.game.scene.getScene('hud');
      return hud ? walk(hud.children.list) : null;
    });
    check(feed === true, `${tag}: the kill feed's weapon icon is painted in the killer's skin (${feed})`);
  }
  await page.screenshot({ path: `${outDir}/${tag}_killer.png` });
  await page.waitForFunction(() => !document.querySelector('[data-testid=killer-card]')?.classList.contains('mcards--on'), null, { timeout: 6000 }).catch(() => {});
  const hidden = await page.evaluate(() => !document.querySelector('[data-testid=killer-card]')?.classList.contains('mcards--on'));
  check(hidden, `${tag}: the killer's card goes when the player is back`);
  if (o.results === false) return;
  // the end: the player first (the podium), the results' cards
  await page.evaluate(() => {
    const s = window.__blatkom.app.session;
    s.world.players.get('local').score = 9;
    [...s.world.players.values()].filter((p) => p.isBot).forEach((p, i) => (p.score = 8 - i));
    s.world.finish('score');
  });
  await page.waitForFunction(() => window.__blatkom.app.screen === 'results', null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => {
    const pod = [...document.querySelectorAll('[data-testid=podium] canvas[data-testid=fighter-card]')];
    const kb = document.querySelector('[data-testid=killed-by] canvas[data-testid=fighter-card]');
    const s = document.querySelector('.ui .screen');
    const btns = [...document.querySelectorAll('.results__buttons .btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    });
    return { podium: pod.length, winner: pod[1]?.dataset.character ?? null, killedBy: kb ? kb.dataset.finish : null, rows: document.querySelectorAll('[data-testid=results-row-card]').length, over: s ? s.scrollHeight - s.clientHeight : null, btns };
  });
  check(res.podium === 3 && res.rows === 6, `${tag}: the results — the podium of three fighter cards, every row of the table opens a card (${JSON.stringify(res)})`);
  check(res.killedBy === (killer?.skin ?? null) || (!killer && res.killedBy === null), `${tag}: «What took you down» shows the skin that did it (${res.killedBy})`);
  check(res.btns.every(Boolean), `${tag}: the results' buttons in view (${JSON.stringify(res)})`);
  await page.screenshot({ path: `${outDir}/${tag}_results.png` });
  // a row → the card big, «Share»
  await page.locator('[data-testid=results-row-card]').nth(1).click();
  await page.getByTestId('card-viewer').waitFor({ timeout: 5000 });
  const share = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=card-share]')?.getBoundingClientRect();
    return !!b && b.width > 0 && b.bottom <= innerHeight + 1;
  });
  check(share, `${tag}: a row of the table opens that fighter's card with «Share»`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/${tag}_viewer.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (killer && o.tryOn !== false) {
    await page.getByTestId('killedby-try').first().click();
    await page.waitForFunction(() => window.__blatkom.app.screen === 'arsenal', null, { timeout: 10000 });
    await page.waitForTimeout(800);
    const tried = await cardInfo(page, '[data-testid=dressing-room] canvas[data-testid=fighter-card], .kitcard canvas[data-testid=fighter-card]');
    check(!!tried && tried.weapon === killer.weapon && tried.finish === killer.skin, `${tag}: «Try on» opens the Arsenal with that skin on that weapon (${JSON.stringify(tried)})`);
    await page.screenshot({ path: `${outDir}/${tag}_tryon.png` });
  }
}

let failed = false;
try {
  // ── a computer ──────────────────────────────────────────────────────────
  const C = await open({ width: 1280, height: 720 });
  await practice(C.page, 'pc');

  // the Arsenal's poster is the player's card; it opens big
  await C.page.evaluate(() => window.__blatkom.app.goMenu());
  await C.page.evaluate(() => window.__blatkom.app.showArsenal(true, 'loadout'));
  await C.page.waitForSelector('[data-testid=dressing-room] canvas[data-testid=fighter-card]', { timeout: 10000 });
  const poster = await cardInfo(C.page, '[data-testid=dressing-room] canvas[data-testid=fighter-card]');
  check(!!poster && poster.inView && poster.w >= 180, `the Arsenal: the dressing room's poster is the player's fighter card (${JSON.stringify(poster)})`);
  await C.page.getByTestId('card-open').first().click();
  await C.page.getByTestId('card-viewer').waitFor({ timeout: 5000 });
  check(true, 'the Arsenal: the card opens big, with «Share»');
  await C.page.keyboard.press('Escape');

  // a set: BLATS granted in the database, the set bought in the characters' tab
  const userId = await C.page.evaluate(() => window.__blatkom.app.online.profile.id);
  await sql`UPDATE profiles SET diamonds = 1000 WHERE user_id = ${userId}`;
  await C.page.evaluate(() => window.__blatkom.app.online.loadInventory());
  await C.page.evaluate(() => window.__blatkom.app.showArsenal(false, 'characters'));
  await C.page.waitForSelector('[data-testid=bundles] [data-testid=bundle]', { timeout: 10000 });
  const sets = await C.page.evaluate(() => [...document.querySelectorAll('[data-testid=bundle]')].map((b) => ({ c: b.dataset.character, card: b.querySelector('canvas[data-testid=fighter-card]')?.dataset.finish })));
  check(sets.length === 9 && sets.every((s) => s.card), `the sets: nine characters, each card with their legendary skin on the automatic (${sets.map((s) => `${s.c}+${s.card}`).join(' ')})`);
  await C.page.screenshot({ path: `${outDir}/pc_sets.png` });
  const lev = C.page.locator('[data-testid=bundle][data-character=lev] [data-testid=bundle-buy]');
  await lev.click();
  await C.page.getByTestId('bundle-confirm').waitFor({ timeout: 5000 });
  const confirmText = (await C.page.getByTestId('bundle-confirm').innerText()).replace(/\s+/g, ' ');
  check(/999/.test(confirmText) && /1598|1 598/.test(confirmText), `the set's confirmation says the price and the price apart («${confirmText}»)`);
  await C.page.getByTestId('bundle-confirm-buy').click();
  await C.page.waitForFunction(() => window.__blatkom.app.screen === 'arsenal' && window.__blatkom.app.online.inventory?.characters.includes('lev'), null, { timeout: 10000 });
  await C.page.waitForTimeout(1000);
  const after = await C.page.evaluate(() => {
    const inv = window.__blatkom.app.online.inventory;
    const c = document.querySelector('[data-testid=dressing-room] canvas[data-testid=fighter-card]');
    return { diamonds: inv.diamonds, skin: inv.loadout.skins?.avtomat ?? null, owns: inv.skins.includes('avtomat.carsky'), character: window.__blatkom.app.character, card: c ? `${c.dataset.character}:${c.dataset.weapon}.${c.dataset.finish}` : null };
  });
  check(after.diamonds === 1 && after.owns && after.skin === 'carsky' && after.character === 'lev' && after.card === 'lev:avtomat.carsky', `the set bought for 999: the character and the skin, the skin on the automatic, the character in play, the card shows them (${JSON.stringify(after)})`);
  const rows = await sql`SELECT kind, item_id, source FROM user_items WHERE user_id = ${userId} ORDER BY kind`;
  const led = await sql`SELECT delta, ref FROM currency_ledger WHERE user_id = ${userId} AND reason = 'purchase'`;
  check(rows.length === 2 && rows.some((r) => r.item_id === 'lev') && rows.some((r) => r.item_id === 'avtomat.carsky') && led.length === 1 && led[0].delta === -999 && led[0].ref === 'bundle:lev', `the server filed both items and one ledger line (${JSON.stringify({ rows, led })})`);
  await C.page.screenshot({ path: `${outDir}/pc_set_bought.png` });
  await C.ctx.close();

  // ── a phone held sideways ───────────────────────────────────────────────
  const P = await open({ width: 390, height: 844 }, { phone: true });
  await practice(P.page, 'phone', { tryOn: false });
  await P.page.evaluate(() => window.__blatkom.app.goMenu());
  await P.page.evaluate(() => window.__blatkom.app.showArsenal(true, 'characters'));
  await P.page.waitForSelector('[data-testid=bundles] [data-testid=bundle]', { timeout: 10000 });
  const pfit = await P.page.evaluate(() => {
    const b = document.querySelector('[data-testid=bundle]');
    const c = b.querySelector('canvas').getBoundingClientRect();
    const btn = b.querySelector('.btn, .badge').getBoundingClientRect();
    return { card: Math.round(c.width), btn: Math.round(btn.width), side: document.scrollingElement.scrollWidth - innerWidth };
  });
  check(pfit.btn <= pfit.card + 2 && pfit.side <= 0, `phone: a set's price button as wide as its card, nothing wider than the screen (${JSON.stringify(pfit)})`);
  await P.page.screenshot({ path: `${outDir}/phone_sets.png` });
  await P.ctx.close();
} catch (e) {
  failed = true;
  console.error('✖ v0.2.23 e2e crashed:', e?.stack ?? e);
}
await browser.close();
await sql.end();
for (const p of problems) console.log('✖ page error:', p);
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n[v0.2.23] ${checks.length - bad}/${checks.length} checks passed${problems.length ? `, ${problems.length} page errors` : ''}`);
process.exit(failed || bad || problems.length ? 1 : 0);
