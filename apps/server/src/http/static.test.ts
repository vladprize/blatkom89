import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from './static.js';

test('byte ranges for audio streaming (menu music): first bytes, suffix, open end, invalid', () => {
  const size = 1000;
  assert.equal(parseRange(undefined, size), null);
  assert.equal(parseRange('items=0-1', size), null, 'other units are ignored: the whole file is sent');
  assert.deepEqual(parseRange('bytes=0-99', size), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=500-', size), { start: 500, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', size), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=-5000', size), { start: 0, end: 999 }, 'a suffix longer than the file is the whole file');
  assert.deepEqual(parseRange('bytes=990-5000', size), { start: 990, end: 999 }, 'the end is clamped to the file');
  assert.equal(parseRange('bytes=1000-', size), 'invalid', 'starting past the end: 416');
  assert.equal(parseRange('bytes=50-10', size), 'invalid');
  assert.equal(parseRange('bytes=-0', size), 'invalid');
  assert.equal(parseRange('bytes=-', size), 'invalid');
});
