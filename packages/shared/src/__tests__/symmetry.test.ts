/**
 * v0.2.18 part 3: the owner asked for «Черкизон» and «Воркута» to be symmetric. What matters for a fair
 * match is mirrored left ↔ right (x → width − x): every wall and solid prop as the collision world sees
 * it (with the same shot blocking), the spawns, weapon pickups, medkits, supply points, flag stands and
 * bases. Decorations (signs, lights, litter) may differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMap, getCollision } from '../maps/index.js';
import type { MapId } from '../maps/types.js';

const EPS = 0.51;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;

function mirrored<T extends { x: number; y: number }>(name: string, list: T[], width: number, same: (a: T, b: T) => boolean = () => true): void {
  for (const a of list) {
    const twin = list.find((b) => near(b.x, width - a.x) && near(b.y, a.y) && same(a, b));
    assert.ok(twin, `${name} at (${a.x}, ${a.y}) has no mirror at (${width - a.x}, ${a.y})`);
  }
}

for (const id of ['cherkizon', 'vorkuta'] as MapId[]) {
  test(`«${id}» is symmetric left ↔ right where play is concerned`, () => {
    const map = getMap(id);
    const W = map.width;
    const shapes = getCollision(id).shapes.filter((s) => s.source !== 'bounds');
    assert.ok(shapes.length > 20, `${id} has collision`);
    for (const s of shapes) {
      const twin =
        s.kind === 'rect'
          ? shapes.find((t) => t.kind === 'rect' && near(t.x, W - s.x - s.w) && near(t.y, s.y) && near(t.w, s.w) && near(t.h, s.h) && t.blocksShot === s.blocksShot)
          : shapes.find((t) => t.kind === 'circle' && near(t.cx, W - s.cx) && near(t.cy, s.cy) && near(t.r, s.r) && t.blocksShot === s.blocksShot);
      assert.ok(twin, `${id}: the ${s.source} ${s.kind} at (${s.x}, ${s.y}, ${s.w}×${s.h}) has no mirror`);
    }
    mirrored(`${id} spawn`, map.spawns, W);
    mirrored(`${id} pickup`, map.pickups, W, (a, b) => a.weapon === b.weapon);
    mirrored(`${id} medkit`, map.medkits, W);
    mirrored(`${id} supply point`, map.supplyPoints, W);
    mirrored(`${id} flag stand`, map.flagStands, W);
    mirrored(`${id} base`, map.bases, W);
    assert.equal(map.flagStands.length, 2);
    assert.equal(map.bases.length, 3);
  });
}
