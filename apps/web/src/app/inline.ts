/**
 * Single-file builds (`build.mjs --mode=demo --single`) embed every asset in the page as
 * `window.__BLATKOM_ASSETS__`: images and fonts as data URIs, atlas JSON as parsed objects.
 * Keys are paths relative to `assets/` (e.g. `sprites/fx.png`). Normal builds load files by URL.
 */
type InlineTable = Record<string, string | Record<string, unknown>>;

function table(): InlineTable | null {
  return (globalThis as { __BLATKOM_ASSETS__?: InlineTable }).__BLATKOM_ASSETS__ ?? null;
}

/** Embedded asset for a path such as `assets/ui/logo.png` or `sprites/fx.json`, if this is a single-file build. */
export function inlineAsset(path: string): string | Record<string, unknown> | undefined {
  return table()?.[path.replace(/^(\.\/)?assets\//, '')];
}

export function isSingleFile(): boolean {
  return table() !== null;
}
