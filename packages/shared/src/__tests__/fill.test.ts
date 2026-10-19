import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILL_RULES, fillTarget, fillPersona } from '../sim/fill.js';
import { PRACTICE_NAMES, fillNickname, randomNickname } from '../game-rules/nicknames.js';
import { displayNameSchema } from '../schemas/api.js';
import { CHARACTER_IDS } from '../game-rules/characters.js';
import { isAvatarId } from '../game-rules/avatars.js';
import { sanitizeLoadout } from '../game-rules/loadout.js';
import { mulberry32 } from '../sim/rng.js';
import { World } from '../sim/world.js';
import { NavGrid } from '../sim/nav.js';
import { BotBrain } from '../sim/bots.js';
import { getMap, getCollision, MAP_ORDER } from '../maps/index.js';

test('fill: the lineup to reach — 4 in free-for-all, 3 a side (even) in team modes, never beyond the room', () => {
  assert.deepEqual(fillTarget('ffa', { total: 1, red: 0, blue: 0 }, 10), { total: FILL_RULES.ffaPlayers });
  assert.deepEqual(fillTarget('ffa', { total: 6, red: 0, blue: 0 }, 10), { total: 6 }, 'more people than the minimum: nobody is added');
  assert.deepEqual(fillTarget('ffa', { total: 1, red: 0, blue: 0 }, 3), { total: 3 }, 'a smaller room caps the lineup');
  for (const mode of ['teams', 'ctf', 'bases'] as const) {
    assert.deepEqual(fillTarget(mode, { total: 1, red: 1, blue: 0 }, 10), { side: FILL_RULES.teamPlayers });
    assert.deepEqual(fillTarget(mode, { total: 6, red: 4, blue: 2 }, 10), { side: 4 }, 'the bigger side sets the size of both');
    assert.deepEqual(fillTarget(mode, { total: 2, red: 2, blue: 0 }, 4), { side: 2 }, 'a small room caps each side');
  }
});

test('fill: added players look like people — valid names (never «bot»), plausible levels, avatars, characters and gear', () => {
  const rnd = mulberry32(1989);
  const taken = new Set<string>(['тихий завхоз', 'kolyan']);
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const around = 1 + Math.floor(rnd() * 40);
    const p = fillPersona(rnd, { lang: i % 2 ? 'ru' : 'en', aroundLevel: around, taken });
    assert.ok(displayNameSchema.safeParse(p.name).success, `valid alias: ${p.name}`);
    assert.equal(p.name, p.name.trim());
    assert.ok(!/bot|бот/i.test(p.name), `no «bot» in ${p.name}`);
    assert.ok(!taken.has(p.name.toLowerCase()), `not a name already in the room: ${p.name}`);
    assert.ok(p.level >= 1 && p.level <= 60 && p.level >= around - 3 && p.level <= around + 6, `level ${p.level} near ${around}`);
    assert.ok(CHARACTER_IDS.includes(p.character));
    assert.ok(p.avatar === null || isAvatarId(p.avatar));
    assert.deepEqual(sanitizeLoadout(p.loadout), p.loadout, 'gear a player could carry');
    assert.ok(['easy', 'normal', 'hard'].includes(p.difficulty));
    seen.add(p.name);
  }
  assert.ok(seen.size > 300, `varied names (${seen.size})`);
});

test('fill: alias suggestions and filled names are valid in both languages, never a practice bot\'s name', () => {
  const rnd = mulberry32(7);
  const practice = [...PRACTICE_NAMES.en, ...PRACTICE_NAMES.ru].map((n) => n.toLowerCase());
  for (let i = 0; i < 3000; i++) {
    for (const lang of ['en', 'ru'] as const) {
      for (const name of [randomNickname(rnd, lang), fillNickname(rnd, lang)]) {
        assert.ok(displayNameSchema.safeParse(name).success, name);
        assert.ok(!/bot|бот/i.test(name), name);
      }
      const filled = fillNickname(rnd, lang).toLowerCase();
      assert.ok(!practice.some((p) => filled === p || filled.startsWith(p)), `${filled} is not a practice bot's name`);
    }
  }
});

test('bots: every reachable goal is found however long the way round, and a bot searches for a way only a few times a second', () => {
  // the search has no cap below the map's walkable cells: the farthest spawn points are always connected
  for (const id of MAP_ORDER) {
    const nav = new NavGrid(getCollision(id));
    const spawns = getMap(id).spawns;
    for (const a of spawns) {
      const far = [...spawns].sort((p, q) => Math.hypot(q.x - a.x, q.y - a.y) - Math.hypot(p.x - a.x, p.y - a.y))[0]!;
      assert.ok(nav.findPath(a.x, a.y, far.x, far.y), `${id}: a way from (${a.x}, ${a.y}) to (${far.x}, ${far.y})`);
    }
    // the reused search space gives the same answers as a fresh grid
    const rnd = mulberry32(5);
    for (let k = 0; k < 8; k++) {
      const q = [rnd() * nav.world.width, rnd() * nav.world.height, rnd() * nav.world.width, rnd() * nav.world.height] as const;
      assert.deepEqual(nav.findPath(...q), new NavGrid(getCollision(id)).findPath(...q));
    }
  }
  // six bots in capture the flag on the courtyard (long ways round the blocks): few searches, all found
  class CountingNav extends NavGrid {
    searches = 0;
    misses = 0;
    override findPath(sx: number, sy: number, tx: number, ty: number, maxExpand?: number) {
      this.searches++;
      const p = super.findPath(sx, sy, tx, ty, maxExpand);
      if (!p) this.misses++;
      return p;
    }
  }
  const w = new World(getMap('yard'), getCollision('yard'), { lagCompensation: false, config: { mode: 'ctf', readyMs: 0, countdownMs: 0 } });
  const nav = new CountingNav(w.collision);
  const brains = ['r1', 'r2', 'r3', 'b1', 'b2', 'b3'].map((id, i) => {
    w.addPlayer(id, id, 'petya', true, undefined, (i < 3 ? 0 : 1) as 0 | 1);
    return new BotBrain(id, w, nav, 'normal', 11 + i);
  });
  w.beginMatch(true);
  const seconds = 30;
  for (let t = 0; t < 60 * seconds; t++) {
    for (const b of brains) w.applyInput(b.id, b.nextInput());
    w.update();
    w.drainEvents();
  }
  assert.ok(nav.searches <= brains.length * seconds * 2, `${nav.searches} searches for ${brains.length} bots in ${seconds} s`);
  assert.equal(nav.misses, 0, 'every search found its way');
});
