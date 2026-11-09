import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTER_IDS } from '@blatkom/shared';
import { FULLBODY } from './fullbody.js';

const DIR = fileURLToPath(new URL('../../public/assets/fullbody/', import.meta.url));

/** A JPEG's size from its SOF marker. */
function jpegSize(b: Buffer): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

test('v0.2.23: every character listed with full-height art has its picture (600 px wide, about 2:3), and no picture is left unlisted', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.jpg'));
  for (const c of FULLBODY) {
    assert.ok(CHARACTER_IDS.includes(c), `${c} is a character`);
    const b = readFileSync(DIR + `${c}.jpg`);
    const s = jpegSize(b);
    assert.ok(s, `${c}.jpg is a JPEG`);
    assert.equal(s!.w, 600, `${c}.jpg is 600 px wide`);
    assert.ok(Math.abs(s!.h / s!.w - 1.5233) < 0.01, `${c}.jpg keeps the cards' proportions (${s!.w}×${s!.h})`);
    assert.ok(b.length < 260 * 1024, `${c}.jpg stays light (${Math.round(b.length / 1024)} KB)`);
  }
  for (const f of files) assert.ok(FULLBODY.has(f.replace(/\.jpg$/, '') as never), `${f} is listed in FULLBODY`);
});
