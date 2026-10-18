// `npm run test:e2e` — browser end-to-end tests against a real server and PostgreSQL.
//   1. builds the web client (production) and the server bundle
//   2. starts the bundled server on E2E_PORT (default 8099) with dev login and 40-second matches
//   3. offline practice: the game boots, a match runs, the player moves and shoots (tests/e2e/play.mjs)
//   4. touch: on an emulated phone the left stick moves, the right stick aims and fires (tests/e2e/touch.mjs)
//   5. online: two independent browsers create/join a room by invite, play, get identical results
//      and persisted XP (tests/e2e/online.mjs); with E2E_ADMIN_USER/E2E_ADMIN_PASS the admin dashboard too
//   6. demo: the single-file offline demo — nickname dialog, assists/points, supply drop, local XP
//      and level, profile screen, persistence after reload (tests/e2e/demo.mjs)
// Needs DATABASE_URL (a disposable database — test players are created) and Playwright's Chromium.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.E2E_PORT ?? 8099);
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
  run(['apps/web/build.mjs', '--mode=production']);
  run(['apps/server/build.mjs']);
  run(['apps/web/build.mjs', '--mode=demo', '--single']);
}
if (!existsSync('apps/server/dist/server.js')) {
  console.error('[e2e] apps/server/dist/server.js missing — build first');
  process.exit(2);
}

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(port),
  PUBLIC_URL: `http://localhost:${port}`,
  DEV_AUTH_ENABLED: 'true',
  STATIC_DIR: 'apps/web/dist',
  MATCH_DURATION_SEC: process.env.MATCH_DURATION_SEC ?? '40',
  SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-only-session-secret-0123456789abcdefghijklmnop',
  LOG_LEVEL: 'warn',
  ...(process.env.E2E_ADMIN_USER ? { ADMIN_BOOTSTRAP_USERNAME: process.env.E2E_ADMIN_USER, ADMIN_BOOTSTRAP_PASSWORD: process.env.E2E_ADMIN_PASS ?? '' } : {}),
};
const server = spawn(process.execPath, ['apps/server/dist/server.js'], { env, stdio: ['ignore', 'inherit', 'inherit'] });
const base = `http://localhost:${port}`;
let failed = false;
try {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${base}/api/ready`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 60) throw new Error('server did not become ready');
    await new Promise((r) => setTimeout(r, 500));
  }
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
  console.log('\n[e2e] single-file demo (no server)');
  const demo = spawnSync(process.execPath, ['tests/e2e/demo.mjs', 'apps/web/dist-demo/blatkom89-demo.html', join(out, 'demo')], { stdio: 'inherit' });
  if (demo.status !== 0) failed = true;
} catch (e) {
  console.error('[e2e]', e.message);
  failed = true;
} finally {
  server.kill('SIGTERM');
}
console.log(failed ? '\n[e2e] FAILED' : `\n[e2e] passed — screenshots in ${out}`);
process.exit(failed ? 1 : 0);
