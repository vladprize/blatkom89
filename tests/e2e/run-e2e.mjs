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
//  12. the roster: 36 characters with portraits (v0.2.18 part 2: +12), the new ones' personal files and prices,
//      practice as a new character, all ten sprite atlases loaded (tests/e2e/roster.mjs)
//  13. phones (v0.24): the menu, the characters and the Arsenal (kit, every shop tab — v0.2.18 BLATS too —
//      its sheets) fit one phone screen at 393×680 RU and 360×640 EN (tests/e2e/phone.mjs)
//  14. clubs (v0.3): the table and a club's page, founding (Latin names), a request taken live, the menu
//      tile with the club's flag (tests/e2e/clubs.mjs)
//  15. invitations (V2.0; v0.2.18 in talons): nothing paid at sign-up, the invite screen and the personal
//      link, a second browser through the link, the invitation counted after a whole match (+150 talons),
//      the inviter told live; with E2E_ADMIN_USER the dashboard's «Приглашения» and the player's card
//      (tests/e2e/invite.mjs)
//  16. the District Tournament (V2.0 «Блатной кон»; v0.2.18 «Турнир района», no stakes): the menu button,
//      the tournament screen, a 1×1 room through an invitation, the leaver loses and the rating moves, the
//      history and the table, the search (tests/e2e/kon.mjs)
//  17. sources (V2.0 part F, with E2E_ADMIN_USER): a partner link made on the dashboard's «Источники»,
//      a phone through it with utm_*, the account and the first visit keep them, the counts, the CSV
//      (tests/e2e/growth.mjs)
//  18. the Telegram Mini App (V2.0 part E, on the sign-in server; Telegram's WebApp object and the bot's
//      webhook calls played by the test): «Link Telegram» on the website → the bot's link → the game in
//      Telegram opens the same account; an email sign-in inside Telegram brings that account; a Kon 1×1
//      between two Telegram phones — fullscreen, the landscape lock, the safe areas in the HUD, minimised
//      with a dead socket and back (tests/e2e/telegram.mjs)
//  19. the story (v0.2.13): the prologue by itself, the hub, mission 1 — its comics, the objective line,
//      the rewards paid by the server once, the next mission open — three lives and the failure screen,
//      «The Report» on a phone (tests/e2e/story.mjs); the same story in the single file opened from disk
//      offline — progress in this browser, chapter 2, and a browser that refuses storage (Safari): the
//      warning, the story still moves on within the session (tests/e2e/story-offline.mjs)
//  20. v0.2.18: no «PLAY» screen and no crypto, full screen (the corner, over a match, the pause menu,
//      the iPhone's note), BLATS for levels, the BLATS tab and its packs, a skin bought in the dressing
//      room and a character on the character screen, practice coming back to where it was started, the
//      score by mode, a phone held sideways filling the window, the story's speaker in the middle, the
//      founder (with E2E_ADMIN_USER), the game's keys typing after a match (tests/e2e/v0218.mjs)
//  v0.2.18 part 2: the welcome gift, 36 characters, the character case (18+, odds, reveal), a friend's
//      collection, grades in the lobby, practice as each of the twelve new characters (tests/e2e/v0218b.mjs)
//  v0.2.18 part 3: Telegram Stars inside the Mini App on the sign-in server (a stand-in answers the Bot API,
//      tests/e2e/fake-botapi.mjs): the banner and the packs in Stars, a cancelled invoice, a paid one credited
//      once after the bot's «yes» to Telegram's pre-checkout question; /paysupport, /terms; the website
//      without Stars; the terms pages (tests/e2e/v0218c.mjs). The two new maps play in tests/e2e/maps.mjs.
//  v0.2.19: the owner's pre-final edits — Instagram in the corner, full screen labelled on a computer, the
//      owner's BLAT banner and Arsenal tile in the page's language, the District Tournament's name aligned,
//      the smallest phone's menu one screen; aliases one word of small Latin letters (typed and on the
//      server); the Arsenal's «Cases» button and the bright «Skins», the skins' cards; no tutorial card; the
//      touch sticks mirrored and clear of their buttons; the prologue covering a phone, its characters in
//      colour (tests/e2e/v0219.mjs). The skins' cards, the 41 finishes and a live skin's frames: tests/e2e/skins.mjs.
//  v0.2.20: the owner's final edits — the welcome BLATS, the promo code, the screens centred and sideways, a
//      match sideways from its first frame, static sticks and the sprint (tests/e2e/v0220.mjs)
//  v0.2.21: the usability pass — a phone's first launch without a registration window, the browser's «back»
//      inside the game, the zoomed phone HUD (no caption under 11 px), first-match hints gone once used, the
//      aim assist, «keep your progress» after the first match; laptop windows (1366×625, 1280×600) without
//      scrolling, the hidden system cursor, the key line (tests/e2e/v0221.mjs). Late joins: unit tests.
//  v0.2.22: above 9 — one light map for a whole match (it was made anew every frame) and the HUD's texts redrawn
//      only on a change, on a phone and a computer; a computer's short window: the maps' names readable in two
//      rows of chips, the Arsenal's dressing room whole; a phone's menu corner 44 px to a finger, no caption
//      under 12 px (tests/e2e/v0222.mjs)
//  v0.2.23: skins you can see — the line-up of fighter cards before a match, the killer's card while respawning,
//      the kill feed's icon in the skin, the podium and «What took you down» with «Try on», a table row's card and
//      «Share», the Arsenal's card, a set bought (a character with their legendary skin), a phone sideways
//      (tests/e2e/v0223.mjs)
//  v0.2.24: the fighter cards in the menu, the wait for a match and the lobby; legendary characters that move; the
//      Season Pass bought, its weeks opened (a computer; a phone from the menu's mark); the HUD's «★ N», a phone's
//      44 px targets, an 800×600 window (tests/e2e/v0224.mjs)
//  21. v0.2.17 part 3: a gang calls another out from its page — the battle room of the two gangs, the
//      call's card live to both gangs' people, sides by gang, nobody else let in (a stranger's link is
//      turned away), the battle played and counted for both gangs; a friend's «To battle» → a duel room
//      by the card (tests/e2e/battle.mjs)
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
// v0.2.24: a Season Pass season for the tests — started eight days ago, its second week of four (the production
// server's season is the owner's to set: PASS_SEASON_ID / PASS_SEASON_START / PASS_SEASON_WEEKS)
const passSeason = { PASS_SEASON_ID: 'e2e', PASS_SEASON_START: new Date(Date.now() - 8 * 86_400_000).toISOString(), PASS_SEASON_WEEKS: '4' };
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
  ...passSeason,
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
  ...passSeason,
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
// v0.2.18 part 3: a stand-in for Telegram's Bot API (Stars invoices) for the third server
const botApiPort = port + 12;
const botApiBase = `http://127.0.0.1:${botApiPort}`;
const botApi = spawn(process.execPath, ['tests/e2e/fake-botapi.mjs', String(botApiPort)], { stdio: ['ignore', 'inherit', 'inherit'] });
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
    // v0.2.18 part 3: Telegram Stars — the Bot API is the local stand-in
    TELEGRAM_API_BASE: botApiBase,
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
  console.log('\n[e2e] the roster: 36 characters, the 22 of v0.23 and v0.2.18 part 2 in the files and in practice');
  const roster = spawnSync(process.execPath, ['tests/e2e/roster.mjs', base, join(out, 'roster')], { stdio: 'inherit' });
  if (roster.status !== 0) failed = true;
  console.log('\n[e2e] phones: every screen and the Arsenal (BLATS too) on one phone screen');
  const phone = spawnSync(process.execPath, ['tests/e2e/phone.mjs', base, join(out, 'phone')], { stdio: 'inherit' });
  if (phone.status !== 0) failed = true;
  console.log('\n[e2e] clubs: the table, founding a club, a request taken live (two browsers)');
  const clubs = spawnSync(process.execPath, ['tests/e2e/clubs.mjs', base, join(out, 'clubs')], { stdio: 'inherit' });
  if (clubs.status !== 0) failed = true;
  console.log('\n[e2e] invitations: the screen, the link, an invitation counted in talons (two browsers)');
  const inviteArgs = ['tests/e2e/invite.mjs', base, join(out, 'invite')];
  if (process.env.E2E_ADMIN_USER) inviteArgs.push(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? '');
  const invite = spawnSync(process.execPath, inviteArgs, { stdio: 'inherit' });
  if (invite.status !== 0) failed = true;
  console.log('\n[e2e] the District Tournament: a 1×1 room by invitation, the rating, the history, the search (three browsers)');
  const kon = spawnSync(process.execPath, ['tests/e2e/kon.mjs', base, join(out, 'kon')], { stdio: 'inherit' });
  if (kon.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.18: full screen, BLATS, a skin and a character bought, practice coming back, the score by mode, sideways, the story, the founder (four browsers)');
  const v0218Args = ['tests/e2e/v0218.mjs', base, join(out, 'v0218')];
  if (process.env.E2E_ADMIN_USER) v0218Args.push(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? '');
  const v0218 = spawnSync(process.execPath, v0218Args, { stdio: 'inherit' });
  if (v0218.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.18 part 2: the welcome gift, 36 characters, the character case, a friend\'s collection, grades in the lobby, the twelve in practice');
  const v0218b = spawnSync(process.execPath, ['tests/e2e/v0218b.mjs', base, join(out, 'v0218b')], { stdio: 'inherit' });
  if (v0218b.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.19: the owner\'s pre-final edits — the menu\'s corner and art, one-word aliases, the Arsenal\'s cases and skins, no tutorial, the touch sticks, the prologue on a phone');
  const v0219 = spawnSync(process.execPath, ['tests/e2e/v0219.mjs', base, join(out, 'v0219')], { stdio: 'inherit' });
  if (v0219.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.20: the owner\'s final edits — the welcome BLATS, the promo code, the screens centred and sideways, a match sideways from its first frame, static sticks and the sprint, the story\'s pairs');
  const v0220 = spawnSync(process.execPath, ['tests/e2e/v0220.mjs', base, join(out, 'v0220')], { stdio: 'inherit' });
  if (v0220.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.21: the usability pass — no registration before the first match, the browser\'s «back», the phone HUD zoomed, first-match hints, the aim assist, laptop windows without scrolling, the hidden cursor');
  const v0221 = spawnSync(process.execPath, ['tests/e2e/v0221.mjs', base, join(out, 'v0221')], { stdio: 'inherit' });
  if (v0221.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.22: above 9 — one light map a match, the HUD\'s texts redrawn on a change, the maps\' names and the dressing room on a short computer window, the phone menu\'s corner to a finger');
  const v0222 = spawnSync(process.execPath, ['tests/e2e/v0222.mjs', base, join(out, 'v0222')], { stdio: 'inherit' });
  if (v0222.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.23: skins you can see — the line-up of fighter cards, the killer\'s card, the podium and «What took you down», a row\'s card and «Share», the Arsenal\'s card, a set bought (a character with their legendary skin)');
  const v0223 = spawnSync(process.execPath, ['tests/e2e/v0223.mjs', base, join(out, 'v0223')], { stdio: 'inherit' });
  if (v0223.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.24: the fighter cards in the menu, the wait for a match and the lobby; legendary characters that move; the Season Pass (a computer and a phone); the HUD\'s counter, a phone\'s 44 px targets, an 800×600 window');
  const v0224 = spawnSync(process.execPath, ['tests/e2e/v0224.mjs', base, join(out, 'v0224')], { stdio: 'inherit' });
  if (v0224.status !== 0) failed = true;
  console.log('\n[e2e] v0.2.17 part 3: gang against gang, a friend called to a duel (two browsers, two socket players)');
  const battle = spawnSync(process.execPath, ['tests/e2e/battle.mjs', base, join(out, 'battle')], { stdio: 'inherit' });
  if (battle.status !== 0) failed = true;
  console.log('\n[e2e] the story: the prologue, the hub, missions with comics and rewards paid by the server, three lives, a phone (two browsers)');
  const storyArgs = ['tests/e2e/story.mjs', base, join(out, 'story')];
  if (process.env.E2E_ADMIN_USER) storyArgs.push(process.env.E2E_ADMIN_USER, process.env.E2E_ADMIN_PASS ?? '');
  const story = spawnSync(process.execPath, storyArgs, { stdio: 'inherit' });
  if (story.status !== 0) failed = true;
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
  console.log('\n[e2e] the story in the single file from disk, offline: a browser that keeps storage and one that refuses it (Safari)');
  const storyOffline = spawnSync(process.execPath, ['tests/e2e/story-offline.mjs', 'apps/web/dist-demo/blatkom89-demo.html', join(out, 'story-offline')], { stdio: 'inherit' });
  if (storyOffline.status !== 0) failed = true;
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
  console.log('\n[e2e] v0.2.18 part 3: Telegram Stars inside the Mini App (the Bot API and Telegram played by the test), the bot’s /paysupport and /terms, the terms pages');
  const v0218c = spawnSync(process.execPath, ['tests/e2e/v0218c.mjs', signBase, join(out, 'v0218c'), botApiBase], { stdio: 'inherit', env: { ...process.env, E2E_TG_BOT_TOKEN } });
  if (v0218c.status !== 0) failed = true;
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
  botApi.kill('SIGTERM');
}
console.log(failed ? '\n[e2e] FAILED' : `\n[e2e] passed — screenshots in ${out}`);
process.exit(failed ? 1 : 0);
