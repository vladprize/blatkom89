import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageGet, storageSet } from './settings.js';

/** Runs `fn` with `localStorage` replaced: a Map-backed stub, or one that refuses like Safari on a file from disk. */
function withStorage(s: Map<string, string> | 'refuse', fn: () => void) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const stub = s === 'refuse' ? null : { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => void s.set(k, v), removeItem: (k: string) => void s.delete(k) };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      if (!stub) throw new Error('SecurityError: The operation is insecure.');
      return stub;
    },
  });
  try {
    fn();
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test('storage the browser refuses (Safari, a file opened from disk) lives for the session', () => {
  withStorage('refuse', () => {
    assert.equal(storageGet('blatkom89.t.a'), null);
    storageSet('blatkom89.t.a', '1');
    assert.equal(storageGet('blatkom89.t.a'), '1', 'the story moves on within the session');
    storageSet('blatkom89.t.a', null);
    assert.equal(storageGet('blatkom89.t.a'), null);
  });
});

test('working storage keeps the values itself; a refused write wins only until a write goes through', () => {
  const store = new Map<string, string>();
  withStorage(store, () => {
    storageSet('blatkom89.t.b', 'x');
    assert.equal(store.get('blatkom89.t.b'), 'x');
    store.set('blatkom89.t.b', 'from another tab');
    assert.equal(storageGet('blatkom89.t.b'), 'from another tab', 'nothing cached when the storage works');
  });
  withStorage('refuse', () => storageSet('blatkom89.t.b', 'session'));
  withStorage(store, () => {
    assert.equal(storageGet('blatkom89.t.b'), 'session', 'the newer, refused write');
    storageSet('blatkom89.t.b', 'saved');
    assert.equal(store.get('blatkom89.t.b'), 'saved');
    store.set('blatkom89.t.b', 'later');
    assert.equal(storageGet('blatkom89.t.b'), 'later', 'back to the storage once a write went through');
  });
});
