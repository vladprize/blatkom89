// Server build (esbuild): bundles the server and its CLIs into apps/server/dist so a production
// image needs only Node.js + this folder (no TypeScript, no tsx, no node_modules).
//   dist/server.js     — HTTP API + static client + WebSocket rooms (migrates on start)
//   dist/db-cli.js     — `node dist/db-cli.js migrate|status`
//   dist/admin-cli.js  — `node dist/admin-cli.js create` (ADMIN_USERNAME/ADMIN_PASSWORD/ADMIN_ROLE)
//   dist/migrations/   — SQL migrations, resolved next to the bundle at runtime
import * as esbuild from 'esbuild';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await esbuild.build({
  entryPoints: {
    server: join(here, 'src/index.ts'),
    'db-cli': join(here, 'src/database/cli.ts'),
    'admin-cli': join(here, 'src/admin/cli.ts'),
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'linked',
  minify: false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
  // optional native accelerators of `ws`; it falls back to JS when they are absent
  external: ['bufferutil', 'utf-8-validate'],
  // CommonJS dependencies (ws) call require() for Node built-ins; give the ESM bundle a real require
  banner: { js: "import { createRequire as __blatkomCreateRequire } from 'node:module';\nconst require = __blatkomCreateRequire(import.meta.url);" },
  define: { 'process.env.BLATKOM_BUNDLED': '"1"' },
});

cpSync(join(here, 'src/database/migrations'), join(out, 'migrations'), { recursive: true });
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: '@blatkom/server-dist', version, private: true, type: 'module' }, null, 2) + '\n');

const size = Object.entries(result.metafile.outputs)
  .filter(([f]) => f.endsWith('.js'))
  .reduce((s, [, o]) => s + o.bytes, 0);
console.log(`[server] build ok → ${out} (${(size / 1024).toFixed(0)} KiB js, v${version})`);
