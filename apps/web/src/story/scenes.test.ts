import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP_ORDER, STORY_MISSIONS } from '@blatkom/shared';
import { MAP_SCENE, SCENE_FOCUS, SCENE_IDS, beatScene, sceneForMap } from './scenes.js';
import { CAMPAIGN_OPENING, MISSION_SCRIPTS, PROLOGUE } from './script.js';
import type { Beat } from './script.js';

const dir = fileURLToPath(new URL('../../public/assets/scenes/', import.meta.url));

/** A JPEG's size from its frame header. */
function jpegSize(b: Buffer): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

test('every scene has its picture: a 1600×900 JPEG of a sensible weight, a 640×360 thumbnail, a focus inside it', () => {
  for (const id of SCENE_IDS) {
    const f = `${dir}${id}.jpg`;
    assert.ok(existsSync(f), `${id}.jpg`);
    const b = readFileSync(f);
    assert.deepEqual(jpegSize(b), { w: 1600, h: 900 }, id);
    assert.ok(b.length < 600 * 1024, `${id}: ${Math.round(b.length / 1024)} KB`);
    const thumb = `${dir}thumbs/${id}.jpg`;
    assert.ok(existsSync(thumb), `thumbs/${id}.jpg`);
    assert.deepEqual(jpegSize(readFileSync(thumb)), { w: 640, h: 360 }, `${id} thumbnail`);
    const [x, y] = SCENE_FOCUS[id];
    assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, id);
  }
});

test('every map has its picture, and so every mission’s comic', () => {
  for (const [map, sc] of Object.entries(MAP_SCENE)) {
    assert.ok((MAP_ORDER as readonly string[]).includes(map), map);
    assert.ok(SCENE_IDS.includes(sc!), `${map} → ${sc}`);
  }
  assert.equal(sceneForMap('cemetery'), 'cemetery');
  assert.equal(sceneForMap('gastronom'), 'univermag');
  assert.equal(sceneForMap(undefined), null);
  for (const map of MAP_ORDER) assert.ok(sceneForMap(map), `${map} has its picture (its loading screen)`);
  for (const m of STORY_MISSIONS) assert.ok(sceneForMap(m.map), `${m.id}: its comic over its place`);
});

test('a page’s picture: its own, else the BLATKOM hall in 2089, else the comic’s place', () => {
  const b = (x: Partial<Beat>): Beat => ({ who: 'caption', say: ['a', 'а'], ...x });
  assert.equal(beatScene(b({}), 'dk'), 'dk');
  assert.equal(beatScene(b({ fx: 'vhs' }), 'dk'), 'dk');
  assert.equal(beatScene(b({ fx: 'neon' }), 'dk'), 'hall2089');
  assert.equal(beatScene(b({ fx: 'neon' }), null), 'hall2089');
  assert.equal(beatScene(b({ fx: 'neon', scene: 'square' }), 'dk'), 'square');
  assert.equal(beatScene(b({ scene: null }), 'dk'), null);
  assert.equal(beatScene(b({}), null), null);
  // the words name only scenes that exist
  const all: Beat[] = [...PROLOGUE, ...Object.values(CAMPAIGN_OPENING).flat(), ...Object.values(MISSION_SCRIPTS).flatMap((s) => [...s.intro, ...s.outro])];
  for (const x of all) if (x.scene) assert.ok(SCENE_IDS.includes(x.scene), x.scene);
  // the prologue: 2089's hall, the last page the tape rolling over the 1989 yard
  assert.deepEqual([...new Set(PROLOGUE.map((x) => beatScene(x, null)))], ['hall2089', 'yard']);
});
