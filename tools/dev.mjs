// `npm run dev` — local development loop:
//   • rebuilds the web client on every change (apps/web/dist, dev mode with source maps)
//   • runs the server from TypeScript sources and restarts it when they change
// Configuration comes from `.env` (copy .env.example) or the shell environment; the shell wins.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const envFile = existsSync('.env') ? ['--env-file=.env'] : [];
if (!envFile.length && !process.env.DATABASE_URL) {
  console.error('[dev] no .env and no DATABASE_URL — copy .env.example to .env first');
  process.exit(2);
}

const children = [
  spawn(process.execPath, ['apps/web/build.mjs', '--mode=dev', '--watch'], { stdio: 'inherit' }),
  spawn(process.execPath, [...envFile, '--watch-path=apps/server/src', '--watch-path=packages/shared/src', '--import', 'tsx', 'apps/server/src/index.ts'], {
    stdio: 'inherit',
    env: { NODE_ENV: 'development', STATIC_DIR: 'apps/web/dist', ...process.env },
  }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const c of children) c.on('exit', (code) => code && stop(code));
