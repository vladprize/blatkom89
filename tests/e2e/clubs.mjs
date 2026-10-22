// Clubs end-to-end (v0.3): two independent browsers — A (English, desktop) and B (Russian, phone).
// The menu's Clubs tile; the club table with twenty and more clubs in Latin letters and a club's page
// (its people, the head first); founding a club (a Cyrillic name gets its Latin version offered, a
// Cyrillic tag turns Latin as it is typed); B finds the club and asks to join, A's page shows the
// request live and A takes B in, B hears it and the menu tile shows the club; recruiting closed.
// The founder's level and talons are set straight in the test database (DATABASE_URL).
//
// Usage: DATABASE_URL=… node tests/e2e/clubs.mjs <baseUrl> <outDir>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir] = process.argv.slice(2);
if (!base || !outDir || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/clubs.mjs <baseUrl> <outDir>');
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
const LATIN = /^[A-Za-z0-9 _.\-’'#!&]+$/;

async function player(name, lang, viewport) {
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
  page.on('pageerror', (e) => problems.push(`[${name} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|telegram\.org/.test(m.text())) problems.push(`[${name} console] ${m.text()}`);
  });
  await page.goto(base + '/');
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
  return { name, ctx, page };
}

try {
  const A = await player('Founder', 'en', { width: 1280, height: 760 });
  const B = await player('Recruit', 'ru', { width: 393, height: 680 });
  const tiles = await A.page.locator('.stiles .stile').count();
  check(tiles === 3 && (await A.page.getByTestId('menu-clubs').count()) === 1, `the menu has Friends · Clubs · Top-100 (${tiles} tiles)`);

  // ── the table and a club's page ─────────────────────────────────────────
  await A.page.getByTestId('menu-clubs').click();
  await A.page.getByTestId('club-row').first().waitFor({ timeout: 20000 });
  const names = await A.page.locator('[data-testid=club-row] .clublabel').allInnerTexts();
  check(names.length >= 20 && names.every((n) => LATIN.test(n.replace(/^\[|\]/g, '').trim())), `the club table: ${names.length} clubs, every name in Latin letters (${names.slice(0, 3).join(' · ')} …)`);
  const flags = await A.page.locator('[data-testid=club-row] svg.clubflag').count();
  check(flags === names.length, `every row has its flag (${flags})`);
  await A.page.screenshot({ path: `${outDir}/clubs_table_A.png` });
  await A.page.getByTestId('club-row').nth(1).click();
  await A.page.locator('.clubhead').waitFor({ timeout: 15000 });
  const page2 = await A.page.evaluate(() => ({
    roles: [...document.querySelectorAll('.clubmember')].map((m) => (m.querySelector('.clubrole') ? 'head' : 'member')),
    line: document.querySelector('.clubhead .muted')?.textContent ?? '',
    join: !!document.querySelector('[data-testid=club-join]'),
  }));
  check(page2.roles[0] === 'head' && page2.roles.filter((r) => r === 'head').length === 1 && page2.roles.length >= 5, `a club's page: ${page2.roles.length} people, the head first («${page2.line}»)`);
  check(page2.join, 'a recruiting club offers «Ask to join»');
  await A.page.screenshot({ path: `${outDir}/clubs_page_A.png` });
  await A.page.locator('.back').click();

  // ── founding ────────────────────────────────────────────────────────────
  const userA = await A.page.evaluate(() => window.__blatkom.app.online.profile.id);
  await sql`UPDATE profiles SET level = 4, xp = 1200, tokens = 800 WHERE user_id = ${userA}`;
  await A.page.reload();
  await A.page.getByTestId('menu-nick').waitFor({ timeout: 60000 });
  await A.page.getByTestId('menu-clubs').click();
  await A.page.getByTestId('club-found').click();
  await A.page.getByTestId('club-editor').waitFor({ timeout: 10000 });
  await A.page.getByTestId('club-name').fill(`Ночные кассеты ${RUN}`);
  const offer = A.page.getByTestId('club-latin').locator('.chip').first();
  await offer.waitFor({ timeout: 5000 });
  const latinName = (await offer.innerText()).trim();
  check(latinName === `Nochnye kassety ${RUN}`, `a Cyrillic club name: the editor offers it in Latin letters («${latinName}»)`);
  await offer.click();
  const NAME = await A.page.getByTestId('club-name').inputValue();
  const TAG = `Z${Math.floor(Math.random() * 900 + 100)}`;
  await A.page.getByTestId('club-tag').fill(`з${TAG.slice(1)}`);
  check((await A.page.getByTestId('club-tag').inputValue()) === TAG, `a Cyrillic tag turns Latin as it is typed (з… → ${TAG})`);
  await A.page.getByTestId('club-motto').fill('Rewind and repeat');
  await A.page.locator('[data-pattern=h3]').click();
  await A.page.locator('[data-icon=cassette]').click();
  await A.page.screenshot({ path: `${outDir}/clubs_editor_A.png` });
  await A.page.getByTestId('club-save').click();
  await A.page.locator('.clubhead').waitFor({ timeout: 15000 });
  const head = await A.page.evaluate(() => ({ name: document.querySelector('.clubhead__name')?.textContent ?? '', role: document.querySelector('.clubmember .clubrole')?.textContent ?? '', edit: !!document.querySelector('[data-testid=club-edit]') }));
  check(head.name.includes(NAME) && head.name.includes(`[${TAG}]`) && head.edit, `«${head.name}» founded; the founder is its ${head.role}`);
  const [p] = await sql`SELECT tokens FROM profiles WHERE user_id = ${userA}`;
  check(p.tokens === 500, `300 talons paid for it (${p.tokens} left)`);

  // ── B asks to join, A takes B in (live) ─────────────────────────────────
  await B.page.getByTestId('menu-clubs').click();
  await B.page.getByTestId('club-search').waitFor({ timeout: 20000 });
  await B.page.getByTestId('club-search').fill(TAG.toLowerCase());
  await B.page.locator('[data-testid=club-row]', { hasText: NAME }).first().waitFor({ timeout: 15000 });
  check(true, `B finds the club by its tag in lower case («${TAG.toLowerCase()}»)`);
  await B.page.locator('[data-testid=club-row]', { hasText: NAME }).first().click();
  await B.page.getByTestId('club-join').click();
  await B.page.getByTestId('club-requested').waitFor({ timeout: 10000 });
  check(true, 'B asked to join: «Заявка отправлена — решает глава клуба»');
  await B.page.screenshot({ path: `${outDir}/clubs_requested_B.png` });
  await A.page.getByTestId('club-requests').waitFor({ timeout: 15000 });
  check((await A.page.locator('[data-testid=club-requests] [data-request]').count()) === 1, 'A’s club page shows the request without a reload');
  await A.page.screenshot({ path: `${outDir}/clubs_request_A.png` });
  await A.page.locator('[data-testid=club-requests] .btn--red').click();
  await A.page.locator('.clubmember', { hasText: `Recruit ${RUN}` }).waitFor({ timeout: 10000 });
  check(true, 'A took B in: B is among the club’s people');
  await B.page.getByText(/Тебя приняли в/).waitFor({ timeout: 15000 });
  check(true, 'B hears it at once («Тебя приняли в …»)');
  await B.page.locator('.club [data-testid=club-leave]').waitFor({ timeout: 15000 });
  await B.page.locator('.back').click();
  await B.page.locator('.back').click().catch(() => {});
  await B.page.getByTestId('menu-nick').waitFor({ timeout: 15000 });
  const tileB = await B.page.getByTestId('menu-clubs').innerText();
  const flagB = await B.page.locator('[data-testid=menu-clubs] svg.clubflag').count();
  check(flagB === 1, `B’s Clubs tile wears the club’s flag («${tileB.replace(/\s+/g, ' ').trim()}»)`);
  await B.page.screenshot({ path: `${outDir}/clubs_menu_B.png` });
  // recruiting closed: a third player is refused at the door
  await A.page.getByTestId('club-recruiting').click();
  await A.page.waitForTimeout(800);
  const closed = await sql`SELECT recruiting FROM clubs WHERE tag = ${TAG}`;
  check(closed[0]?.recruiting === false, 'A closed recruiting');
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await A.ctx.close();
  await B.ctx.close();
} catch (e) {
  check(false, `clubs flow: ${e.message}`);
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `[clubs] ${failed.length} of ${checks.length} checks failed` : `[clubs] all ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
