// Web client build (esbuild). Usage: node apps/web/build.mjs --mode=production|demo|dev [--watch] [--single]
//   --single (with --mode=demo): also writes dist-demo/blatkom89-demo.html — one self-contained file
//   (code, styles, sprites, fonts embedded) that runs from disk or any static host, no server needed.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, basename, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const mode = args.mode ?? 'production';
const watch = args.watch === 'true';
const single = args.single === 'true';
const outDir = join(here, mode === 'demo' ? 'dist-demo' : 'dist');
const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
// Content hash of the generated assets: appended as ?v= so long-lived caches never mix old and new sprites.
const manifestPath = join(here, 'public/assets/manifest.json');
const assetVersion = existsSync(manifestPath) ? createHash('sha1').update(readFileSync(manifestPath)).digest('hex').slice(0, 10) : version;

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

/** Embeds every asset (images/fonts as data URIs, atlas JSON as objects) for the single-file demo. */
function assetTable() {
  const dir = join(here, 'public/assets');
  const table = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== '.cache') walk(f);
        continue;
      }
      const rel = relative(dir, f).split('\\').join('/');
      const ext = extname(f).toLowerCase();
      if (ext === '.png') table[rel] = `data:image/png;base64,${readFileSync(f).toString('base64')}`;
      else if (ext === '.woff') table[rel] = `data:font/woff;base64,${readFileSync(f).toString('base64')}`;
      else if (ext === '.json' && rel !== 'manifest.json') table[rel] = JSON.parse(readFileSync(f, 'utf8'));
    }
  };
  walk(dir);
  return table;
}

function writeSingleFile(meta) {
  const hit = Object.entries(meta.outputs).find(([file, o]) => o.entryPoint && o.entryPoint.endsWith('src/main.ts') && file.endsWith('.js'));
  if (!hit) throw new Error('main bundle not found');
  const js = readFileSync(resolve(hit[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = hit[1].cssBundle ? readFileSync(resolve(hit[1].cssBundle), 'utf8').replace(/<\/style/gi, '<\\/style') : '';
  const table = assetTable();
  const licences = readFileSync(join(here, 'public/THIRD_PARTY_LICENSES.txt'), 'utf8').replace(/--/g, '—');
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#0d0b0a" />
<title>БЛАТКОМ ’89</title>
<link rel="icon" href="${table['ui/icon.png']}" />
<!--
БЛАТКОМ ’89 v${version} — single-file offline demo (practice with bots). No data is collected.
${licences}
-->
<style>${css}</style>
</head>
<body>
<div id="game"></div>
<div id="ui" class="ui"></div>
<div id="boot" class="boot"><div class="boot__tape">БЛАТКОМ ’89</div><div class="boot__bar"><i></i></div><div class="boot__hint">Загрузка кассеты…</div></div>
<noscript>Для игры нужен JavaScript.</noscript>
<script>window.__BLATKOM_ASSETS__=${JSON.stringify(table).replace(/</g, '\\u003c')};</script>
<script type="module">${js}</script>
</body>
</html>
`;
  const out = join(outDir, 'blatkom89-demo.html');
  writeFileSync(out, html);
  console.log(`[web] single-file demo → ${out} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
}

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
  banner: { js: `/*! БЛАТКОМ ’89 v${version}. Includes Phaser 3.90.0 — Copyright (c) 2024 Richard Davey, Phaser Studio Inc., MIT License; see THIRD_PARTY_LICENSES.txt */` },
  logLevel: 'warning',
  logOverride: { 'duplicate-object-key': 'silent', 'equals-negative-zero': 'silent', 'suspicious-boolean-not': 'silent' },
  alias: { phaser: 'phaser/dist/phaser.esm.js' },
  loader: { '.woff': 'file', '.png': 'file' },
  define: {
    __MODE__: JSON.stringify(mode === 'demo' ? 'demo' : 'online'),
    __VERSION__: JSON.stringify(version),
    __DEV__: JSON.stringify(mode === 'dev'),
    __ASSET_VERSION__: JSON.stringify(assetVersion),
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
            if (single && mode === 'demo') writeSingleFile(r.metafile);
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
