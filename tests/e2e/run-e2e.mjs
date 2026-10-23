// `npm run test:e2e` — browser end-to-end tests against a real server and PostgreSQL.
//   1. builds the web client (production) and the server bundle
//   2. starts the bundled server on E2E_PORT (default 8099) with dev login and 40-second matches
//   3. offline practice: the game boots, a match runs, the player moves and shoots (tests/e2e/play.mjs)
//   4. touch: on an emulated phone the left stick moves, the right stick aims and fires (tests/e2e/touch.mjs)
//   5. online: two independent browsers create/join a room by invite, play, get identical results
//      and persisted XP (tests/e2e/online.mjs); with E2E_ADMIN_USER/E2E_ADMIN_PASS the admin dashboard too
//   6. demo: the single-file offline demo — nickname dialog, assists/points, supply drop, local XP
//      and level, profile screen, persistence after reload (tests/e2e/demo.mjs)
//   7. equipment: F-1, smoke, flashbang, molotov, mine, C4 and turret used with the G key in the demo
//      build, checked against the World state (tests/e2e/gadgets.mjs)
//   8. game modes online: a capture-the-flag room for an English and a Russian browser, mode switching
//      in the lobby, flags in both HUDs, team results, Quick Match by mode (tests/e2e/modes.mjs)
//   9. filled lineups: a second server with MATCH_FILL_BOTS=true — a room with friends started alone and
//      Quick Match alone both play with 4, nobody marked (tests/e2e/fill.mjs). Stages 3–8 run with the
//      fill switched off, so their two-person rooms stay exactly two people.
//  10. social (v0.23): the account window of a guest, unique aliases, a friend request by alias, private
//      messages with read receipts, «Play» → a live invitation joined from its card, the Top-100
//      (tests/e2e/social.mjs)
//  11. weapon skins (v0.23): the skin case opened in the Arsenal, the reveal, the dressing room's
//      picker, the skin on the weapon in hand and on the HUD icon in practice (tests/e2e/skins.mjs)
//  12. the roster (v0.23): 24 characters with portraits, the ten new ones' personal files and prices,
//      practice as a new character, all ten sprite atlases loaded (tests/e2e/roster.mjs)
//  13. phones (v0.24): the menu, the characters and the Arsenal (kit, every shop tab, its sheets) fit one
//      phone screen at 393×680 RU and 360×640 EN, and nothing is sold for money (tests/e2e/phone.mjs)
//  14. clubs (v0.3): the table and a club's page, founding (Latin names), a request taken live, the menu
//      tile with the club's flag (tests/e2e/clubs.mjs)
//  15. $BLAT (V2.0): the welcome on the menu tile, the $BLAT screen and the personal link, a second
//      browser through the link, the invitation counted after a whole match, the inviter told live;
//      BLAT DROP; with E2E_ADMIN_USER the dashboard's $BLAT page and snapshots (tests/e2e/blat.mjs)
//  16. «Блатной кон» (V2.0): the menu button, the Kon screen, a 1×1 room through an invitation, the
//      leaver loses and the Kon rating moves, the history and the table, the search (tests/e2e/kon.mjs)
//  17. sources (V2.0 part F, with E2E_ADMIN_USER): a partner link made on the dashboard's «Источники»,
//      a phone through it with utm_*, the account and the first visit keep them, the counts, the CSV
//      (tests/e2e/growth.mjs)
//  18. the Telegram Mini App (V2.0 part E, on the sign-in server; Telegram's WebApp object and the bot's
//      webhook calls played by the test): «Link Telegram» on the website → the bot's link → the game in
//      Telegram opens the same account; an email sign-in inside Telegram brings that account; a Kon 1×1
//      between two Telegram phones — fullscreen, the landscape lock, the safe areas in the HUD, minimised
//      with a dead socket and back (tests/e2e/telegram.mjs)
// Needs DATABASE_URL (a disposable database — test players are created) and Playwright's Chromium.
// E2E_PROD=1 runs the prebuilt deploy/ bundle exactly as a host would (NODE_ENV=production, guest login,
// RENDER_EXTERNAL_URL, TRUST_PROXY) instead of the development server.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.E2E_PORT ?? 8099);
const prod = process.env.E2E_PROD === '1' || process.argv.includes('--prod');
const out = process.env.E2E_OUT ?? join('test-results', 'e2e');
mkdirSync(out, { recursive: true });
if (!process.env.DATABASE_URL) {
  console.error('[e2e] DATABASE_URL is required (use a disposable database)');
  process.exit(2);
}

const run = (args, opts = {}) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!process.env.E2E_SKIP_BUILD) {
  if (prod) run(['tools/build-deploy.mjs']);
  else {
    run(['apps/web/build.mjs', '--mode=production']);
    run(['apps/server/build.mjs']);
  }
  run(['apps/web/build.mjs', '--mode=demo', '--single']);
}
const serverJs = prod ? 'deploy/server.js' : 'apps/server/dist/server.js';
if (!existsSync(serverJs)) {
  console.error(`[e2e] ${serverJs} missing — build first`);
  process.exit(2);
}

const base = `http://localhost:${port}`;
const prodEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  RENDER_EXTERNAL_URL: base,
  GUEST_AUTH_ENABLED: 'true',
  // every browser of the suite is a new guest from 127.0.0.1 (about a dozen per run)
  GUEST_SIGNUPS_PER_IP_HOUR: '200',
  DEV_AUTH_ENABLED: 'false',
  TRUST_PROXY: 'true',
  STATIC_DIR: 'public',
  TELEGRAM_BOT_TOKEN: '',
  MATCH_DURATION_SEC: process.env.MATCH_DURATION_SEC ?? '40',
  MATCH_FILL_BOTS: 'false',
  SESSION_SECRET: randomBytes(32).toString('base64'),
  LOG_LEVEL: 'warn',
  ...(process.env.E2E_ADMIN_USER ? { ADMIN_BOOTSTRAP_USERNAME: process.env.E2E_ADMIN_USER, ADMIN_BOOTSTRAP_PASSWORD: process.env.E2E_ADMIN_PASS ?? '' } : {}),
};
delete prodEnv.PUBLIC_URL;
delete prodEnv.TELEGRAM_BOT_TOKEN;
const env = prod ? prodEnv : {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(port),
  PUBLIC_URL: `http://localhost:${port}`,
  DEV_AUTH_ENABLED: 'true',
  STATIC_DIR: 'apps/web/dist',
  MATCH_DURATION_SEC: process.env.MATCH_DURATION_SEC ?? '40',
  MATCH_FILL_BOTS: 'false',
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-only-session-secret-0123456789abcdefghijklmnop',
  LOG_LEVEL: 'warn',
  ...(process.env.E2E_ADMIN_USER ? { ADMIN_BOOTSTRAP_USERNAME: process.env.E2E_ADMIN_USER, ADMIN_BOOTSTRAP_PASSWORD: process.env.E2E_ADMIN_PASS ?? '' } : {}),
};
const startServer = (e) =>
  prod
    ? spawn(process.execPath, ['server.js'], { env: e, cwd: 'deploy', stdio: ['ignore', 'inherit', 'inherit'] })
    : spawn(process.execPath, ['apps/server/dist/server.js'], { env: e, stdio: ['ignore', 'inherit', 'inherit'] });
const ready = async (url) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${url}/api/ready`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (i > 60) throw new Error(`server at ${url} did not become ready`);
    await new Promise((r) => setTimeout(r, 500));
  }
};
const server = startServer(env);
// the same build and database with filled lineups switched on (the production default)
const fillPort = port + 1;
const fillBase = `http://localhost:${fillPort}`;
let fillServer = null;
// v0.3: the same build and database with every sign-in provider set up — fake keys, no provider is contacted
const signPort = port + 2;
const signBase = `http://localhost:${signPort}`;
const E2E_TG_BOT_TOKEN = '7000000002:AAE2E-fake-bot-token-for-the-signin-test';
const E2E_TG_BOT_USERNAME = 'blatkom_e2e_bot';
let signServer = null;
if (prod) console.log('[e2e] production mode: deploy/server.js with guest login');
let failed = false;
try {
  await ready(base);
  fillServer = startServer({ ...env, PORT: String(fillPort), MATCH_FILL_BOTS: 'true', ...(prod ? { RENDER_EXTERNAL_URL: fillBase } : { PUBLIC_URL: fillBase }), ADMIN_BOOTSTRAP_USERNAME: '', ADMIN_BOOTSTRAP_PASSWORD: '' });
  signServer = startServer({
    ...env,
    PORT: String(signPort),
    ...(prod ? { RENDER_EXTERNAL_URL: signBase } : { PUBLIC_URL: signBase }),
    ADMIN_BOOTSTRAP_USERNAME: '',
    ADMIN_BOOTSTRAP_PASSWORD: '',
    GOOGLE_CLIENT_ID: 'e2e-google-id',
    GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
    DISCORD_CLIENT_ID: 'e2e-discord-id',
    DISCORD_CLIENT_SECRET: 'e2e-discord-secret',
    FACEBOOK_APP_ID: 'e2e-facebook-id',
    FACEBOOK_APP_SECRET: 'e2e-facebook-secret',
    REDDIT_CLIENT_ID: 'e2e-reddit-id',
    REDDIT_CLIENT_SECRET: 'e2e-reddit-secret',
    TELEGRAM_BOT_TOKEN: E2E_TG_BOT_TOKEN,
    TELEGRAM_WEB_LOGIN: 'true',
    // V2.0 part E: the bot's username makes «Link Telegram» possible (the bot itself is played by the test)
    TELEGRAM_BOT_USERNAME: E2E_TG_BOT_USERNAME,
  });
  console.log('\n[e2e] offline practice');
  const offline = spawnSync(process.execPath, ['tests/e2e/play.mjs', `${base}/?play=offline&map=factory&bots=3`, join(out, 'offline')], { stdio: 'inherit' });
  if (offline.status !== 0) failed = true;
  console.log('\n[e2e] touch controls (emulated phone, multi-touch sticks)');
  const touch = spawnSync(process.execPath, ['tests/e2e/touch.mjs', base, join(out, 'touch.png')], { stdio: 'inherit' });
  if (touch.status !== 0) failed = true;
  console.log('\n[e2e] online match (two browsers)');
  const args = ['tests/e2e/online.mjs', base, out];
  if (process.env.E2E_ADMIN_USER) args.push(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? '');
  const online = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (online.status !== 0) failed = true;
  console.log('\n[e2e] friends, private messages, invitations, Top-100 (two browsers)');
  const social = spawnSync(process.execPath, ['tests/e2e/social.mjs', base, join(out, 'social')], { stdio: 'inherit' });
  if (social.status !== 0) failed = true;
  console.log('\n[e2e] weapon skins: the skin case, the dressing room, a skin in practice');
  const skins = spawnSync(process.execPath, ['tests/e2e/skins.mjs', base, join(out, 'skins')], { stdio: 'inherit' });
  if (skins.status !== 0) failed = true;
  console.log('\n[e2e] the roster: 24 characters, the ten new ones in the files and in practice');
  const roster = spawnSync(process.execPath, ['tests/e2e/roster.mjs', base, join(out, 'roster')], { stdio: 'inherit' });
  if (roster.status !== 0) failed = true;
  console.log('\n[e2e] phones: every screen and the Arsenal on one phone screen, nothing for money');
  const phone = spawnSync(process.execPath, ['tests/e2e/phone.mjs', base, join(out, 'phone')], { stdio: 'inherit' });
  if (phone.status !== 0) failed = true;
  console.log('\n[e2e] clubs: the table, founding a club, a request taken live (two browsers)');
  const clubs = spawnSync(process.execPath, ['tests/e2e/clubs.mjs', base, join(out, 'clubs')], { stdio: 'inherit' });
  if (clubs.status !== 0) failed = true;
  console.log('\n[e2e] $BLAT: the welcome, the screen, an invitation through the link counted (two browsers)');
  const blatArgs = ['tests/e2e/blat.mjs', base, join(out, 'blat')];
  if (process.env.E2E_ADMIN_USER) blatArgs.push(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? '');
  const blat = spawnSync(process.execPath, blatArgs, { stdio: 'inherit' });
  if (blat.status !== 0) failed = true;
  console.log('\n[e2e] «Блатной кон»: a 1×1 room by invitation, the Kon rating, the history, the search (three browsers)');
  const kon = spawnSync(process.execPath, ['tests/e2e/kon.mjs', base, join(out, 'kon')], { stdio: 'inherit' });
  if (kon.status !== 0) failed = true;
  if (process.env.E2E_ADMIN_USER) {
    console.log('\n[e2e] sources: a partner link made on the dashboard, a phone through it with a campaign, the counts and the CSV');
    const growth = spawnSync(process.execPath, ['tests/e2e/growth.mjs', base, join(out, 'growth'), process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? ''], { stdio: 'inherit' });
    if (growth.status !== 0) failed = true;
  }
  console.log('\n[e2e] the three new maps: the picker in Russian, the cemetery, the square and the pioneer camp in practice');
  const maps = spawnSync(process.execPath, ['tests/e2e/maps.mjs', base, join(out, 'maps')], { stdio: 'inherit' });
  if (maps.status !== 0) failed = true;
  console.log('\n[e2e] game modes online (capture the flag, base capture; English and Russian)');
  const modes = spawnSync(process.execPath, ['tests/e2e/modes.mjs', base, join(out, 'modes')], { stdio: 'inherit' });
  if (modes.status !== 0) failed = true;
  console.log('\n[e2e] single-file demo (no server)');
  const demo = spawnSync(process.execPath, ['tests/e2e/demo.mjs', 'apps/web/dist-demo/blatkom89-demo.html', join(out, 'demo')], { stdio: 'inherit' });
  if (demo.status !== 0) failed = true;
  console.log('\n[e2e] equipment: grenades, mines, C4, turret (demo build)');
  const gadgets = spawnSync(process.execPath, ['tests/e2e/gadgets.mjs', 'apps/web/dist-demo/blatkom89-demo.html', join(out, 'gadgets')], { stdio: 'inherit' });
  if (gadgets.status !== 0) failed = true;
  console.log('\n[e2e] sign-in with Google, Telegram, Discord (third server with every provider set up; providers stubbed)');
  await ready(signBase);
  const signin = spawnSync(process.execPath, ['tests/e2e/signin.mjs', signBase, join(out, 'signin'), base], { stdio: 'inherit', env: { ...process.env, E2E_TG_BOT_TOKEN } });
  if (signin.status !== 0) failed = true;
  console.log('\n[e2e] the Telegram Mini App: Telegram linked to an existing account, fullscreen, safe areas, minimised and back (the third server; Telegram played by the test)');
  const telegram = spawnSync(process.execPath, ['tests/e2e/telegram.mjs', signBase, join(out, 'telegram'), E2E_TG_BOT_USERNAME], { stdio: 'inherit', env: { ...process.env, E2E_TG_BOT_TOKEN } });
  if (telegram.status !== 0) failed = true;
  console.log('\n[e2e] filled lineups (second server, MATCH_FILL_BOTS=true): one person always plays');
  await ready(fillBase);
  const fill = spawnSync(process.execPath, ['tests/e2e/fill.mjs', fillBase, join(out, 'fill')], { stdio: 'inherit' });
  if (fill.status !== 0) failed = true;
} catch (e) {
  console.error('[e2e]', e.message);
  failed = true;
} finally {
  server.kill('SIGTERM');
  fillServer?.kill('SIGTERM');
  signServer?.kill('SIGTERM');
}
console.log(failed ? '\n[e2e] FAILED' : `\n[e2e] passed — screenshots in ${out}`);
process.exit(failed ? 1 : 0);
