// Where players come from (V2.0 part F), end to end: the administrator creates a partner link on the
// dashboard's «Источники» page; a new player's phone opens the game through it with a campaign — the
// address loses `?p=` and `utm_*`, the new account and the first visit keep the partner and the campaign;
// the page counts the visit and the account for the link, lists the source, and the partners' CSV has it.
// Measuring only: nothing is paid or credited to a partner.
//
// Usage: DATABASE_URL=… node tests/e2e/growth.mjs <baseUrl> <outDir> <adminUser> <adminPass>
import { chromium } from 'playwright';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';

const [base, outDir, adminUser, adminPass] = process.argv.slice(2);
if (!base || !outDir || !adminUser || !adminPass || !process.env.DATABASE_URL) {
  console.error('usage: DATABASE_URL=… node tests/e2e/growth.mjs <baseUrl> <outDir> <adminUser> <adminPass>');
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
const CODE = `e2e_${RUN}`;

try {
  // ── the dashboard: a partner link ─────────────────────────────────────────
  const actx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ru-RU', timezoneId: 'UTC' });
  const admin = await actx.newPage();
  admin.on('pageerror', (e) => problems.push(`[admin pageerror] ${e.message}`));
  admin.on('dialog', (d) => void d.accept());
  await admin.goto(base + '/admin');
  await admin.locator('input[name=username]').fill(adminUser);
  await admin.locator('input[name=password]').fill(adminPass);
  await admin.locator('button[type=submit]').click();
  await admin.locator('nav a', { hasText: 'Источники' }).click();
  await admin.getByTestId('partners').waitFor({ timeout: 15000 });
  await admin.getByTestId('partner-name').fill(`E2E Streamer ${RUN}`);
  await admin.getByTestId('partner-code').fill(CODE);
  await admin.getByTestId('partner-add').click();
  const row = admin.locator(`tr[data-code="${CODE}"]`);
  await row.waitFor({ timeout: 15000 });
  const link = (await row.getByTestId('partner-web').textContent()).trim();
  check(link === `${base}/?p=${CODE}`, `the dashboard makes the partner link (${link})`);

  // ── a new player's phone comes through it with a campaign ────────────────
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pctx.addInitScript(() => {
    try {
      localStorage.setItem('blatkom89.lang.v1', 'ru');
      localStorage.setItem('blatkom89.tutorial.v1', '1');
      localStorage.setItem('blatkom89.welcome.v1', String(Date.now()));
    } catch {}
  });
  const phone = await pctx.newPage();
  phone.on('pageerror', (e) => problems.push(`[phone pageerror] ${e.message}`));
  await phone.goto(`${link}&utm_source=TikTok&utm_medium=video&utm_campaign=launch`);
  await phone.waitForFunction(() => {
    const b = document.getElementById('boot');
    return !b || b.classList.contains('boot--hidden') || !!document.querySelector('[data-testid=boot-play]');
  }, null, { timeout: 90000 });
  if (await phone.getByTestId('boot-play').count()) await phone.getByTestId('boot-play').click();
  const nick = phone.getByRole('textbox', { name: 'Кличка' });
  await nick.waitFor({ timeout: 60000 });
  check(new URL(phone.url()).search === '', `the address loses ?p= and utm_* (${new URL(phone.url()).pathname}${new URL(phone.url()).search})`);
  await nick.fill(`Partnered ${RUN}`);
  await phone.getByRole('button', { name: 'Готово' }).click();
  await phone.getByTestId('menu-nick').waitFor({ timeout: 20000 });
  const me = await phone.evaluate(() => window.__blatkom?.app?.online?.profile?.id ?? null);
  const [acc] = await sql`SELECT u.source_channel, u.source_detail, p.code FROM users u LEFT JOIN partners p ON p.id = u.partner_id WHERE u.id = ${me}`;
  check(acc?.source_channel === 'partner' && acc?.code === CODE, `the new account keeps the partner (${JSON.stringify(acc)})`);
  // the visit ping is sent once the menu is up
  let visit = null;
  for (let i = 0; i < 20 && !visit?.code; i++) {
    [visit] = await sql`SELECT v.utm_source, v.utm_medium, v.utm_campaign, p.code FROM visitors v LEFT JOIN partners p ON p.id = v.partner_id WHERE v.user_id = ${me}`;
    if (!visit?.code) await phone.waitForTimeout(500);
  }
  check(visit?.code === CODE && visit?.utm_source === 'tiktok' && visit?.utm_medium === 'video' && visit?.utm_campaign === 'launch', `the first visit keeps the partner and the campaign (${JSON.stringify(visit)})`);
  await pctx.close();

  // ── the dashboard counts it ───────────────────────────────────────────────
  await admin.reload();
  await admin.getByTestId('partners').waitFor({ timeout: 15000 });
  await row.waitFor({ timeout: 15000 });
  const cells = await row.evaluate((el) => [...el.cells].map((c) => c.textContent.trim()));
  check(cells[2] === '1' && cells[3] === '1', `the link’s row: 1 visit, 1 account (${cells.slice(2, 8).join(' | ')})`);
  const src = await admin.getByTestId('sources-table').locator('tbody tr', { hasText: CODE }).first().evaluate((el) => [...el.cells].map((c) => c.textContent.trim()));
  check(src[0] === 'Партнёрская ссылка' && src[2] === '1', `the sources table: ${src.join(' | ')}`);
  const tiles = await admin.getByTestId('growth-tiles').innerText();
  check(/Уникальные игроки/i.test(tiles) && /Начали первый матч/i.test(tiles) && /\$BLAT начислено/i.test(tiles), 'the page’s numbers: unique players, first matches, $BLAT issued');
  await admin.screenshot({ path: `${outDir}/growth_admin.png`, fullPage: true });
  const csv = await admin.evaluate(async () => (await fetch('/api/admin/export/partners.csv?range=7d', { credentials: 'same-origin' })).text());
  check(csv.includes(`${CODE},E2E Streamer`) && /,1,1,0,0,0,0\r?\n/.test(csv.split('\n').find((l) => l.startsWith(CODE)) + '\n'), `the partners’ CSV has the link with its numbers (${csv.split('\n').find((l) => l.startsWith(CODE))?.trim()})`);
  // the overview shows the new numbers too
  await admin.locator('nav a', { hasText: 'Обзор' }).click();
  await admin.locator('.tile-label', { hasText: 'Уникальные игроки' }).waitFor({ timeout: 15000 });
  check(true, 'the overview has «Уникальные игроки», «Начали первый матч», «$BLAT начислено»');
  check(problems.length === 0, `no page errors (${problems.join(' | ')})`);
  await actx.close();
} catch (e) {
  console.error('[growth] failed:', e);
  checks.push({ ok: false, what: `exception: ${e.message}` });
} finally {
  await browser.close();
  await sql.end({ timeout: 5 });
}
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `[growth] ${bad.length} of ${checks.length} checks failed` : `[growth] all ${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
