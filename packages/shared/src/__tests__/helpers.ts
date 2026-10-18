import { World, BTN } from '../sim/world.js';
import type { InputFrame } from '../sim/world.js';
import { MapBuilder } from '../maps/builder.js';
import { CollisionWorld } from '../maps/collision.js';
import { quantizeAngle } from '../sim/math.js';
import type { MapDef } from '../maps/types.js';

/** Small open test arena: 400x300 with one wall block in the middle. */
export function testMap(): MapDef {
  return new MapBuilder('factory', 'Test', '', '', 400, 300, 'concrete_slab')
    .wall('brick', 190, 100, 20, 100)
    .spawn(50, 150, 0)
    .spawn(350, 150, 180)
    .spawn(50, 40, 0)
    .spawn(350, 260, 180)
    .pickup('avtomat', 100, 260)
    .build();
}

export function makeWorld(map = testMap(), lag = false) {
  const world = new World(map, new CollisionWorld(map), { lagCompensation: lag, config: { countdownMs: 0, readyMs: 0, spawnProtectionMs: 0 } });
  return world;
}

let seq = 0;
export function input(partial: Partial<InputFrame> & { aimRad?: number } = {}): InputFrame {
  return {
    seq: ++seq,
    moveX: partial.moveX ?? 0,
    moveY: partial.moveY ?? 0,
    aim: partial.aimRad !== undefined ? quantizeAngle(partial.aimRad) : (partial.aim ?? 0),
    buttons: partial.buttons ?? 0,
    slot: partial.slot ?? 0,
    viewTime: partial.viewTime ?? 0,
  };
}

/** Starts a match immediately and returns two players placed at given positions. */
export function startDuel(world: World, a = { x: 60, y: 150 }, b = { x: 160, y: 150 }) {
  const p1 = world.addPlayer('a', 'Петя', 'petya');
  const p2 = world.addPlayer('b', 'Валюта', 'valuta');
  world.beginMatch(true);
  // countdown 0ms -> active on next update
  world.update();
  world.update();
  p1.x = a.x;
  p1.y = a.y;
  p2.x = b.x;
  p2.y = b.y;
  p1.invulnUntil = 0;
  p2.invulnUntil = 0;
  world.drainEvents();
  return { p1, p2 };
}

export { BTN };
