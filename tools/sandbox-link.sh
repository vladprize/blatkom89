#!/usr/bin/env bash
# Sandbox-only bootstrap. In a normal environment just run `npm install`.
# The build sandbox used for this project had no access to the npm registry, so dependencies were
# linked from preinstalled tool packages and from GitHub tags (same versions as package.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NM="$ROOT/node_modules"
OPT=/opt/npm-tools/node_modules
VENDOR=${VENDOR_SRC:-/home/claude/vendor-src}
mkdir -p "$NM/@blatkom" "$NM/@types" "$NM/.bin"
ln -sfn "$ROOT/packages/shared" "$NM/@blatkom/shared"
ln -sfn "$ROOT/apps/server" "$NM/@blatkom/server"
ln -sfn "$ROOT/apps/web" "$NM/@blatkom/web"
for p in typescript esbuild ws zod tsx playwright playwright-core; do ln -sfn "$OPT/$p" "$NM/$p"; done
mkdir -p "$NM/@esbuild" && ln -sfn "$OPT/@esbuild/linux-x64" "$NM/@esbuild/linux-x64"
ln -sfn "$OPT/@types/node" "$NM/@types/node"
ln -sfn "$OPT/undici-types" "$NM/undici-types"
# phaser@3.90.0 (github.com/phaserjs/phaser tag v3.90.0, dist + types only)
ln -sfn "$VENDOR/phaser" "$NM/phaser"
# postgres@3.4.9 (github.com/porsager/postgres tag v3.4.9)
ln -sfn "$VENDOR/postgres" "$NM/postgres"
# Minimal @types/ws shim (the real @types/ws is installed by npm in normal environments)
if [ ! -e "$NM/@types/ws/index.d.ts" ]; then
  mkdir -p "$NM/@types/ws" && cp "$ROOT/tools/sandbox/ws-shim.d.ts" "$NM/@types/ws/index.d.ts"
  echo '{"name":"@types/ws","version":"0.0.0-sandbox","types":"index.d.ts"}' > "$NM/@types/ws/package.json"
fi
ln -sfn "$OPT/typescript/bin/tsc" "$NM/.bin/tsc"
ln -sfn "$OPT/esbuild/bin/esbuild" "$NM/.bin/esbuild"
ln -sfn "$OPT/tsx/dist/cli.mjs" "$NM/.bin/tsx"
echo "sandbox node_modules linked"
