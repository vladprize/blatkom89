import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_IDS, getMap, getCollision } from '@blatkom/shared';
import { buildOccluders, OccluderIndex, Visibility, castLit, convexHull, shadowHull, inside, lightReaches, RIM } from './shadows.js';
import type { Occluder } from './shadows.js';
import { LOOKS } from './looks.js';
import { TIERS } from './tiers.js';

const rect = (x: number, y: number, w: number, h: number, wall = true, reach = Infinity): Occluder => ({ kind: 'rect', x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: 0, reach, wall, solid: true });
const circle = (cx: number, cy: number, r: number, reach = 1.5): Occluder => ({ kind: 'circle', x: cx - r, y: cy - r, w: r * 2, h: r * 2, cx, cy, r, reach, wall: false, solid: true });

/** Whether a point lies inside a convex polygon given as a flat list. */
function inPoly(poly: number[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    const c = (poly[j]! - poly[i]!) * (y - poly[i + 1]!) - (poly[j + 1]! - poly[i + 1]!) * (x - poly[i]!);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

test('a convex hull keeps the outer points and drops the inner ones', () => {
  const hull = convexHull([0, 0, 10, 0, 10, 10, 0, 10, 5, 5, 2, 7]);
  assert.equal(hull.length, 8);
  assert.ok(inPoly(hull, 5, 5));
  assert.ok(!inPoly(hull, 11, 5));
});

test('light stops at a wall, a rim deep, and crosses a crate to its far edge', () => {
  const wall = rect(100, -50, 20, 100);
  assert.equal(castLit([wall], 0, 0, 1, 0, 500), 100 + RIM, 'a wall is lit a rim deep');
  const thin = rect(100, -50, 4, 100);
  assert.equal(castLit([thin], 0, 0, 1, 0, 500), 104, 'never past a thin wall');
  const crate = rect(100, -8, 16, 16, false, 1.55);
  assert.equal(castLit([crate], 0, 0, 1, 0, 500), 116, "a crate's top is lit: the shadow starts behind it");
  assert.equal(castLit([crate, rect(140, -50, 20, 100)], 0, 0, 1, 0, 500), 116, 'the nearest thing decides');
  assert.equal(castLit([wall], 0, 0, -1, 0, 500), 500, 'nothing behind the light');
  assert.equal(castLit([wall], 110, 0, 1, 0, 500), 500, 'a light inside a wall is not stopped by it');
  const barrel = circle(100, 0, 7);
  assert.ok(Math.abs(castLit([barrel], 0, 0, 1, 0, 500) - 107) < 1e-6, 'a barrel: to its far side');
  assert.equal(castLit([barrel], 0, 20, 1, 0, 500), 500, 'a ray that misses');
});

test('the visibility fan: sorted directions, short where a wall stands, full where nothing does', () => {
  const index = new OccluderIndex([rect(60, -200, 20, 400)], 600, 600);
  const vis = new Visibility().compute(index, 0, 0, 200, 32);
  assert.ok(vis.n >= 32);
  for (let i = 1; i < vis.n; i++) assert.ok(vis.ang[i]! > vis.ang[i - 1]!, 'sorted, no duplicates');
  let east = Infinity;
  let west = 0;
  for (let i = 0; i < vis.n; i++) {
    if (Math.abs(vis.ang[i]!) < 0.3) east = Math.min(east, vis.dist[i]!);
    if (Math.abs(Math.abs(vis.ang[i]!) - Math.PI) < 0.3) west = Math.max(west, vis.dist[i]!);
  }
  assert.ok(east <= 60 / Math.cos(0.3) + RIM + 1, `east is cut by the wall (${east})`);
  assert.equal(west, 200);
  // extra rays (a beam's edges) are kept
  const more = new Visibility().compute(index, 0, 0, 200, 32, [0.123, -0.456]);
  assert.equal(more.n, vis.n + 2);
});

test("a shadow's hull: behind the occluder, not in front of it; none for a lamp inside", () => {
  const crate = rect(100, -8, 16, 16, false, 1.5);
  const hull = shadowHull(crate, 0, 0, 1000)!;
  assert.ok(inPoly(hull, 140, 0), 'behind it');
  assert.ok(!inPoly(hull, 190, 0), 'a crate throws a shadow of a length');
  assert.ok(!inPoly(hull, 80, 0), 'not in front');
  const wall = rect(100, -50, 30, 100);
  const far = shadowHull(wall, 0, 0, 1000)!;
  assert.ok(inPoly(far, 600, 0), "a wall's shadow runs to the light's edge");
  assert.ok(!inPoly(far, 100 + RIM - 1, 0), 'its rim is lit');
  assert.ok(inPoly(far, 100 + RIM + 1, 0), 'its top past the rim is dark');
  assert.equal(shadowHull(wall, 110, 0, 1000), null);
  assert.ok(inside(wall, 110, 0) && !inside(wall, 90, 0));
});

test('every map: its occluders match what stops shots, and every lamp reaches the floor around it', () => {
  for (const id of MAP_IDS) {
    const map = getMap(id);
    const occ = buildOccluders(map);
    const col = getCollision(id);
    const solid = occ.filter((o) => o.solid).length;
    const blocking = col.shapes.filter((s) => s.blocksShot && s.source !== 'bounds').length;
    assert.equal(solid, blocking, `${id}: what stops a hand-held light is what stops a bullet`);
    assert.ok(occ.length >= solid);
    const index = new OccluderIndex(occ, map.width, map.height);
    const near: Occluder[] = [];
    // from a lamp's own spot (unless it hangs over something) the light gets out in most directions
    let open = 0;
    let lamps = 0;
    for (const l of map.lights) {
      index.query(l.x - l.radius, l.y - l.radius, l.x + l.radius, l.y + l.radius, near, true);
      if (near.some((o) => inside(o, l.x, l.y))) continue;
      lamps++;
      let free = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (lightReaches(near, l.x, l.y, l.x + Math.cos(a) * 24, l.y + Math.sin(a) * 24)) free++;
      }
      if (free >= 6) open++;
    }
    assert.ok(open >= lamps * 0.8, `${id}: ${open} of ${lamps} lamps light the floor round them`);
  }
});

test('every map has a look, and the tiers only get cheaper downwards', () => {
  for (const id of MAP_IDS) {
    const look = LOOKS[id];
    assert.ok(look, id);
    assert.ok(look.night > 0.4 && look.night <= 1, `${id}: the night is dark, not black`);
    assert.ok(look.bloom >= 0 && look.bloom <= 1.5);
  }
  assert.ok(TIERS[0].lightRes <= TIERS[1].lightRes && TIERS[1].lightRes <= TIERS[2].lightRes);
  assert.ok(TIERS[0].samples <= TIERS[1].samples && TIERS[1].samples <= TIERS[2].samples);
  assert.ok(TIERS[0].shadowFlashes <= TIERS[1].shadowFlashes && TIERS[1].shadowFlashes <= TIERS[2].shadowFlashes);
  assert.ok(TIERS[0].bloomPasses <= TIERS[1].bloomPasses && TIERS[1].bloomPasses <= TIERS[2].bloomPasses);
});
