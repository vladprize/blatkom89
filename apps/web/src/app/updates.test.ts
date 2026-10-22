import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageBundle, watchForUpdates } from './updates.js';

const page = (b: string) => `<!doctype html><link rel="stylesheet" href="assets/app-X1.css" /><script type="module" src="${b}"></script>`;
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('fresh builds: the bundle a page names', () => {
  assert.equal(pageBundle(page('assets/app-5KT237NT.js')), 'assets/app-5KT237NT.js');
  assert.equal(pageBundle(page('/assets/app-AB_c-9.js')), 'assets/app-AB_c-9.js');
  assert.equal(pageBundle('<html>maintenance</html>'), null);
});

test('fresh builds: a newer bundle reloads the page — at once in the menu, otherwise on the way back to it; never twice for one build', async () => {
  const store = memory();
  let reloads = 0;
  let canReload = false;
  let html = page('assets/app-NEW.js');
  const w = watchForUpdates({ own: 'assets/app-OLD.js', canReload: () => canReload, fetchPage: async () => html, reload: () => reloads++, storage: store })!;
  assert.ok(w);
  assert.equal(await w.check(), true, 'a newer build is found');
  assert.equal(reloads, 0, 'not in the middle of a match');
  canReload = true;
  w.atMenu();
  assert.equal(reloads, 1, 'reloaded on the way back to the menu');
  assert.equal(store.getItem('blatkom89.reloadedFor'), 'assets/app-NEW.js');
  // after the reload a cache still serves the old bundle: no second reload for the same build
  const again = watchForUpdates({ own: 'assets/app-OLD.js', canReload: () => true, fetchPage: async () => html, reload: () => reloads++, storage: store })!;
  assert.equal(await again.check(), false);
  assert.equal(reloads, 1);
  // the next release does reload
  html = page('assets/app-NEWER.js');
  assert.equal(await again.check(), true);
  assert.equal(reloads, 2, 'in the menu: at once');
});

test('fresh builds: the same build, an unreachable server or a page without a bundle change nothing; the demo file has nothing to compare', async () => {
  let reloads = 0;
  const same = watchForUpdates({ own: 'assets/app-A.js', canReload: () => true, fetchPage: async () => page('assets/app-A.js'), reload: () => reloads++, storage: null })!;
  assert.equal(await same.check(), false);
  const down = watchForUpdates({ own: 'assets/app-A.js', canReload: () => true, fetchPage: async () => Promise.reject(new Error('offline')), reload: () => reloads++, storage: null })!;
  assert.equal(await down.check(), false);
  const odd = watchForUpdates({ own: 'assets/app-A.js', canReload: () => true, fetchPage: async () => '<html>502 Bad Gateway</html>', reload: () => reloads++, storage: null })!;
  assert.equal(await odd.check(), false);
  assert.equal(reloads, 0);
  assert.equal(watchForUpdates({ own: null, canReload: () => true }), null);
});
