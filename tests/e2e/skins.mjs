// Weapon skins end-to-end (v0.23; v0.2.18: the skin case costs 299 BLATS — money — so its odds open from
// the case tab and it asks «I am 18 or older»): a player with BLATS opens the skin case in the Arsenal,
// sees the skin revealed and in the collection, the dressing room marks it as theirs and paints the weapon,
// an unowned finish can be tried on and offers its grade and price, and in practice the weapon in hand and
// the HUD icon wear the skin. The BLATS are granted straight in the test database (DATABASE_URL).
//
// Usage: DATABASE_URL=… node tests/e2e/skins.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/skins.mjs <baseUrl> <outDir>');
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('blatkom89.lang.v1', 'en');
    localStorage.setItem('blatkom89.tutorial.v1', '1');
    localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
  } catch {}
});
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[console] ${m.text()}`);
});
async function pressPlay() {
  await page.waitForFunction(() => {
    const boot = document.getElementById('boot');
    return !boot || boot.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  const play = page.getByTestId('boot-play');
  if (await play.count()) await play.click();
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('boot--hidden'), null, { timeout: 10000 });
}

try {
  await page.goto(base + '/');
  await pressPlay();
  const nick = page.getByRole('textbox', { name: 'Alias' });
  await nick.waitFor({ timeout: 60000 });
  await nick.fill(`Dandy ${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const userId = await page.evaluate(() => window.__blatkom.app.online.profile.id);
  await sql`UPDATE profiles SET diamonds = 1000 WHERE user_id = ${userId}`;

  await page.getByTestId('arsenal-tile').click();
  await page.locator('.tabs button', { hasText: 'Case' }).click();
  await page.getByTestId('skin-case').waitFor({ timeout: 15000 });
  const owned0 = await page.getByTestId('skins-owned').innerText();
  check(/0 of 1248/.test(owned0), `the skin case is on the case tab next to the weapon case: 1248 skins — the 39 finishes on sale on 32 weapons (the welcome gift and the retired first line aren't in it) («${owned0}»)`);
  await page.getByTestId('skin-odds-open').click();
  await page.getByTestId('skin-odds').waitFor({ timeout: 5000 });
  const odds = (await page.getByTestId('skin-odds').innerText()).replace(/\s+/g, ' ');
  check((await page.locator('[data-testid=skin-odds] tbody tr').count()) === 4 && /40/.test(odds) && /30/.test(odds) && /20/.test(odds) && /10/.test(odds), `the skin odds before buying: four grades, 40 / 30 / 20 / 10 % («${odds.slice(0, 120)}…»)`);
  await page.getByTestId('sheet-close').click();
  await page.getByTestId('skin-odds').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.getByTestId('open-skin-case').click();
  check((await page.getByTestId('case-adult').count()) === 1 && !(await page.getByTestId('case-confirm').isEnabled()), 'a case for BLATS asks «I am 18 or older» before it opens');
  await page.getByTestId('case-adult').check();
  await page.getByTestId('case-confirm').click();
  await page.getByTestId('skin-reveal').waitFor({ timeout: 15000 });
  const revealed = (await page.getByTestId('skin-reveal').locator('.h1').innerText()).trim();
  check(revealed.includes('·'), `the skin is revealed: «${revealed}»`);
  const inv = await page.evaluate(() => window.__blatkom.app.online.inventory);
  // v0.2.18 part 2: the welcome gift («Акула», «Блатком ’89» on every weapon) is in the inventory too
  const gift = (id) => /\.(akulka|blatkom)$/.test(id);
  const caseSkins = inv.skins.filter((id) => !gift(id));
  const skin = caseSkins[0];
  const [weapon, finish] = skin.split('.');
  check(caseSkins.length === 1 && inv.diamonds === 701, `one skin from the case in the inventory (${skin}), 299 BLATS spent`);
  check(inv.skins.filter(gift).length === 64, `the welcome gift: «Shark» and «Blatkom ’89» on all 32 weapons (${inv.skins.filter(gift).length})`);
  check(inv.loadout.skins[weapon] === finish, 'the new skin went on its weapon at once');
  await page.screenshot({ path: `${outDir}/skins_reveal.png` });
  const rows = await sql`SELECT kind, finish_id, price, currency FROM case_openings WHERE user_id = ${userId}`;
  check(rows.length === 1 && rows[0].kind === 'skin' && rows[0].finish_id === finish && rows[0].price === 299 && rows[0].currency === 'diamonds', 'the opening is recorded on the server (299 BLATS)');
  check(!['berezka', 'rzhavchina', 'zima', 'flora', 'gzhel', 'pioner', 'malahit', 'zoloto', 'yantar', 'akulka', 'blatkom'].includes(finish), `the case gives only a finish on sale — never a gift or a retired one (${finish})`);

  // the dressing room: try the skin on and see it marked as yours
  await page.locator('[data-testid=skin-reveal] [data-try]').click();
  await page.locator(`[data-testid=skin-pick] [data-finish="${finish}"][aria-pressed="true"]`).waitFor({ timeout: 10000 });
  const chip = await page.locator(`[data-testid=skin-pick] [data-finish="${finish}"]`).innerText();
  check(chip.includes('✓'), `the dressing room marks the finish as yours («${chip.trim()}»)`);
  const painted = await page.waitForFunction(() => document.querySelector('.dressing__item')?.getAttribute('src')?.startsWith('data:image/png'), null, { timeout: 10000 }).then(() => true).catch(() => false);
  check(painted, 'the big weapon picture is painted with the finish');
  const other = finish === 'yadernaya' ? 'kosmos' : 'yadernaya';
  await page.locator(`[data-testid=skin-pick] [data-finish="${other}"]`).click();
  await page.getByTestId('skin-buy-row').waitFor({ timeout: 5000 });
  const note = (await page.getByTestId('skin-buy-row').innerText()).replace(/\s+/g, ' ');
  check(other === 'yadernaya' ? /Legendary/i.test(note) && /499/.test(note) : /Epic/i.test(note) && /299/.test(note), `an unowned finish can be tried on and offers its grade and price («${note}»)`);
  // the line in the picker: the 39 on sale and the 2 gifts (the retired first line only to those who have it),
  // each a card with the weapon painted in it; the four live ones say so (v0.2.19)
  const chips = await page.locator('[data-testid=skin-pick] .skinchip[data-finish]:not([data-finish=""])').evaluateAll((els) => els.map((e) => e.getAttribute('data-finish')));
  check(chips.length === 41 && chips.includes('akulka') && chips.includes('blatkom') && chips.includes('bratok') && !chips.includes('zima') && !chips.includes('berezka'), `the dressing room offers the owner's line: 41 finishes, the gifts and the AK sheet's among them, no retired ones (${chips.length}: ${chips.join(', ')})`);
  const cards = await page.locator('[data-testid=skin-pick] .skincard').evaluateAll((els) => ({ n: els.length, pics: els.filter((e) => e.querySelector('.skincard__pic img')).length, live: els.filter((e) => e.querySelector('.skincard__live')).map((e) => e.getAttribute('data-finish')).sort() }));
  check(cards.n === 42 && cards.pics === 42 && JSON.stringify(cards.live) === JSON.stringify(['almaz', 'bratok', 'krovavy', 'obsidian']), `every skin is a card with its picture, the standard paint first; the live four are marked (${JSON.stringify(cards)})`);
  // a live skin's picture moves: its card's picture changes frames
  const liveSrc = () => page.locator('[data-testid=skin-pick] .skincard[data-finish=almaz] .skincard__pic img').getAttribute('src');
  await page.locator('[data-testid=skin-pick] .skincard[data-finish=almaz]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-testid=skin-pick] .skincard[data-finish=almaz] .skincard__pic img')?.getAttribute('src')?.startsWith('data:'), null, { timeout: 10000 }).catch(() => {});
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    seen.add(await liveSrc());
    await page.waitForTimeout(140);
  }
  check(seen.size >= 3, `a live skin's card loops through its frames (${seen.size} different pictures in about a second)`);
  await page.locator(`[data-testid=skin-pick] [data-finish="${finish}"]`).click();
  await page.getByTestId('dressing-room').screenshot({ path: `${outDir}/skins_dressing.png` });

  // practice: the weapon in hand and the HUD icon wear it
  await page.getByRole('button', { name: 'Test in practice' }).click();
  await page.waitForFunction(() => window.__blatkom?.game?.scene.getScene('game')?.session?.phase?.() === 'active', null, { timeout: 30000 });
  // the skin's weapon may sit in any slot: take it in hand
  const current = () => page.evaluate(() => window.__blatkom.game.scene.getScene('game').session.players().find((p) => p.isLocal).weapon);
  for (const key of ['3', '1', '2']) {
    if ((await current()) === weapon) break;
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
  const inHand = await page.evaluate(() => {
    const s = window.__blatkom.game.scene.getScene('game');
    const me = s.session.players().find((p) => p.isLocal);
    const v = s.views.get(me.slot);
    const hud = window.__blatkom.game.scene.getScene('hud');
    return { weapon: me.weapon, skin: me.skin, gun: v?.gun.texture.key, hud: hud.weaponIcon.texture.key };
  });
  // (a live finish's texture carries its frame: skin~w_avtomat~almaz~7)
  const wears = (key, frame) => key === `skin~${frame}~${finish}` || key?.startsWith(`skin~${frame}~${finish}~`);
  check(inHand.weapon === weapon && inHand.skin === finish && wears(inHand.gun, `w_${weapon}`), `in practice the ${weapon} in hand wears ${finish} (${inHand.gun})`);
  check(wears(inHand.hud, `ico_${weapon}`), 'the HUD icon wears it too');
  await page.screenshot({ path: `${outDir}/skins_practice.png` });
} catch (e) {
  check(false, `flow failed: ${e.message.split('\n')[0]}`);
  await page.screenshot({ path: `${outDir}/skins_fail.png` }).catch(() => {});
}
for (const p of problems) console.log('  problem:', p);
await browser.close();
await sql.end({ timeout: 5 });
const failed = checks.filter((c) => !c.ok).length + problems.length;
console.log(failed ? `[skins] ${failed} problem(s)` : `[skins] all ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
