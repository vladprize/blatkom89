// Web client build (esbuild). Usage: node apps/web/build.mjs --mode=production|demo|dev [--watch]
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const mode = args.mode ?? 'production';
const watch = args.watch === 'true';
const outDir = join(here, mode === 'demo' ? 'dist-demo' : 'dist');
const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;

function copyPublic() {
  cpSync(join(here, 'public'), outDir, { recursive: true, filter: (src) => !src.includes('.cache') });
}

function writeHtml(meta) {
  const outputs = Object.entries(meta.outputs);
  // JS outputs carry `entryPoint`; the CSS extracted from a JS entry is referenced via `cssBundle`.
  const find = (entry, ext) => {
    const hit = outputs.find(([file, o]) => o.entryPoint && o.entryPoint.endsWith(entry) && file.endsWith('.js'));
    if (!hit) return null;
    const file = ext === '.css' ? hit[1].cssBundle : hit[0];
    return file ? 'assets/' + basename(file) : null;
  };
  const tg = mode === 'demo' ? '' : '<script src="https://telegram.org/js/telegram-web-app.js?59"></script>';
  const tpl = readFileSync(join(here, 'src/index.html'), 'utf8');
  const html = tpl
    .replace('%TELEGRAM_SCRIPT%', tg)
    .replace('%APP_CSS%', find('src/main.ts', '.css') ?? '')
    .replace('%APP_JS%', find('src/main.ts', '.js'))
    .replace(/%VERSION%/g, version);
  writeFileSync(join(outDir, 'index.html'), html);
  const adminJs = find('src/admin/main.ts', '.js');
  if (adminJs && existsSync(join(here, 'admin.html'))) {
    const admin = readFileSync(join(here, 'admin.html'), 'utf8')
      .replace(/\/?assets\/admin\.js/g, '/' + adminJs)
      .replace(/\/?assets\/admin\.css/g, '/' + (find('src/admin/main.ts', '.css') ?? 'assets/admin.css'));
    writeFileSync(join(outDir, 'admin.html'), admin);
  }
}

const entryPoints = { app: join(here, 'src/main.ts') };
if (mode !== 'demo' && existsSync(join(here, 'src/admin/main.ts'))) entryPoints.admin = join(here, 'src/admin/main.ts');

const options = {
  entryPoints,
  outdir: join(outDir, 'assets'),
  entryNames: '[name]-[hash]',
  assetNames: '[name]-[hash]',
  bundle: true,
  format: 'esm',
  splitting: false,
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  platform: 'browser',
  minify: mode !== 'dev',
  sourcemap: mode === 'dev' ? 'linked' : false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'warning',
  logOverride: { 'duplicate-object-key': 'silent', 'equals-negative-zero': 'silent', 'suspicious-boolean-not': 'silent' },
  alias: { phaser: 'phaser/dist/phaser.esm.js' },
  loader: { '.woff': 'file', '.png': 'file' },
  define: {
    __MODE__: JSON.stringify(mode === 'demo' ? 'demo' : 'online'),
    __VERSION__: JSON.stringify(version),
    __DEV__: JSON.stringify(mode === 'dev'),
    'process.env.NODE_ENV': JSON.stringify(mode === 'dev' ? 'development' : 'production'),
  },
  plugins: [
    {
      name: 'html',
      setup(build) {
        build.onStart(() => {
          rmSync(join(outDir, 'assets'), { recursive: true, force: true });
          mkdirSync(outDir, { recursive: true });
          copyPublic();
        });
        build.onEnd((r) => {
          if (r.errors.length === 0 && r.metafile) {
            writeHtml(r.metafile);
            const size = Object.values(r.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
            console.log(`[web] ${mode} build ok → ${outDir} (${(size / 1024).toFixed(0)} KiB js/css)`);
          }
        });
      },
    },
  ],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[web] watching…');
} else {
  await esbuild.build(options);
}
