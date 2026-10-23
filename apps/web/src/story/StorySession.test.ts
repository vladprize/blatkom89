import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS, TICK_MS, storyMission } from '@blatkom/shared';
import type { StoryMission } from '@blatkom/shared';
import { StorySession } from './StorySession.js';
import { MISSION_SCRIPTS } from './script.js';

const run = (s: StorySession, ms: number) => {
  for (let t = 0; t < ms; t += TICK_MS) s.step(null);
};
const mission = (id: string): StoryMission => storyMission(id)!;
/** Through the countdown. */
const start = (m: StoryMission) => {
  const s = new StorySession(m, { seed: 7 });
  run(s, 3100);
  assert.equal(s.phase(), 'active');
  return s;
};
const hero = (s: StorySession) => s.world.players.get('local')!;
const enemies = (s: StorySession) => [...s.world.players.values()].filter((p) => p.team === 1);
type P = ReturnType<typeof hero>;
/** `by` drops `p` (spawn protection off). */
const drop = (s: StorySession, p: P, by: P) => {
  p.invulnUntil = 0;
  s.world.applyDamage(p, by, 999, 'pistol');
};
const down = (s: StorySession, p: P) => drop(s, p, hero(s));

test('a mission sets up its own sides: the hero and allies red, the enemies blue, named by who they are', () => {
  const s = new StorySession(mission('a2'), { seed: 1 });
  const ps = [...s.world.players.values()];
  assert.equal(hero(s).character, 'petya');
  assert.equal(hero(s).name, 'Petya');
  assert.equal(hero(s).team, 0);
  assert.deepEqual(ps.filter((p) => p.team === 0).map((p) => p.character).sort(), ['mihalych', 'petya']);
  assert.equal(ps.filter((p) => p.team === 1).length, 3);
  assert.equal(ps.find((p) => p.character === 'mihalych')!.name, 'Mikhalych');
  assert.ok(ps.filter((p) => p.team === 1).every((p) => p.name === 'Queue Jumper'));
  // the hero's kit is the mission's, not the player's loadout
  assert.equal(hero(s).primary, 'obrez');
  assert.equal(hero(s).melee, 'montirovka');
  run(s, 3100);
  // the sides stay as the mission set them (no evening out at the start)
  assert.equal([...s.world.players.values()].filter((p) => p.team === 0).length, 2);
});

test('clear: the ones who are down stay down, everyone down is the win; the lines come once each', () => {
  const s = start(mission('a1'));
  assert.deepEqual(s.drainCues(), ['start']);
  assert.deepEqual(s.goal(), { left: 3, score: 0, limit: 0, lives: 3 });
  const [a, b, c] = enemies(s);
  down(s, a!);
  run(s, 100);
  assert.deepEqual(s.drainCues(), ['firstKill']);
  assert.equal(s.goal().left, 2);
  down(s, b!);
  run(s, 6000); // longer than a respawn: still down
  assert.equal(a!.alive, false);
  assert.equal(s.goal().left, 1);
  assert.equal(s.outcome(), null);
  down(s, c!);
  run(s, 100);
  assert.deepEqual(s.outcome(), { result: 'win' });
  assert.deepEqual(s.drainCues(), ['win']);
  run(s, 100);
  assert.equal(s.phase(), 'finished');
  assert.equal(s.heroStats().kills, 3);
  assert.ok(s.elapsedMs() >= 6200 && s.elapsedMs() < 7000, `elapsed ${s.elapsedMs()}`);
  assert.equal(s.hud().story?.outcome, 'win');
});

test('clear: the hero has three lives — the third fall is the end; the hero takes half the damage', () => {
  const s = start(mission('b1'));
  const h = hero(s);
  h.invulnUntil = 0;
  s.world.applyDamage(h, enemies(s)[0]!, 30, 'pistol');
  assert.equal(h.hp, 85, 'half of 30');
  for (let fall = 1; fall <= 2; fall++) {
    drop(s, hero(s), enemies(s)[0]!);
    run(s, 100);
    assert.equal(s.outcome(), null, `fall ${fall} of 3`);
    assert.equal(s.goal().lives, 3 - fall);
    run(s, 4000);
    assert.equal(hero(s).alive, true, 'back after the fall');
  }
  drop(s, hero(s), enemies(s)[0]!);
  run(s, 100);
  assert.deepEqual(s.outcome(), { result: 'fail', reason: 'down' });
  assert.equal(s.goal().lives, 0);
  assert.equal(s.phase(), 'finished');
  assert.equal(s.hud().story?.outcome, 'fail');
  assert.equal(s.hud().story?.reason, 'down');
  assert.equal(s.hud().story?.label, 'First Day');
});

test('clear with waves: each wave comes after the gap once the field is empty; the line comes with the last one', () => {
  const m = mission('a3');
  const sizes = [0, 1, 2].map((w) => m.npcs.filter((n) => (n.wave ?? 0) === w).length);
  assert.deepEqual(sizes, [2, 2, 1]);
  const s = start(m);
  s.drainCues();
  assert.equal(s.goal().left, 5);
  let seen = 0;
  for (let w = 0; w < sizes.length; w++) {
    if (w > 0) {
      run(s, (m.waveGapMs ?? 1500) + 100);
      const cues = s.drainCues();
      assert.equal(cues.includes('wave'), w === sizes.length - 1, `wave ${w}: the line ${w === sizes.length - 1 ? 'now' : 'not yet'}`);
    }
    const wave = enemies(s).filter((p) => p.alive);
    assert.equal(wave.length, sizes[w], `wave ${w} on the field`);
    for (const e of wave) down(s, e);
    run(s, 100);
    seen += sizes[w]!;
    assert.equal(s.goal().left, 5 - seen);
    if (w < sizes.length - 1) assert.equal(s.outcome(), null);
  }
  assert.deepEqual(s.outcome(), { result: 'win' });
});

test('team: the side that reaches the limit first wins; the enemy reaching it is a loss', () => {
  const s = start(mission('a5'));
  assert.deepEqual(s.goal(), { left: 1, score: 0, limit: 5, lives: null });
  const boss = enemies(s)[0]!;
  s.world.teamScore[0] = 4;
  down(s, boss);
  run(s, 100);
  assert.deepEqual(s.outcome(), { result: 'win' });
  const l = start(mission('a5'));
  l.world.teamScore[1] = 4;
  drop(l, hero(l), enemies(l)[0]!);
  run(l, 100);
  assert.deepEqual(l.outcome(), { result: 'fail', reason: 'lost' });
});

test('team: the hero comes back after being dropped; half the limit says «half» once', () => {
  const s = start(mission('a2'));
  s.drainCues();
  drop(s, hero(s), enemies(s)[0]!);
  run(s, 100);
  assert.equal(s.outcome(), null);
  run(s, 4000);
  assert.equal(hero(s).alive, true);
  s.world.teamScore[0] = 5;
  run(s, 50);
  assert.deepEqual(s.drainCues(), ['half']);
  s.world.teamScore[0] = 6;
  run(s, 50);
  assert.deepEqual(s.drainCues(), []);
});

test('the clock: out of time is a loss, except in «survive» where it is the win', () => {
  const quick = { ...mission('a2'), timeLimitMs: 4000 };
  const s = start(quick);
  run(s, 4200);
  assert.deepEqual(s.outcome(), { result: 'fail', reason: 'time' });
  const survive: StoryMission = { ...mission('a1'), objective: { kind: 'survive' }, timeLimitMs: 4000 };
  const v = start(survive);
  run(v, 4200);
  assert.deepEqual(v.outcome(), { result: 'win' });
});

test('every mission plays: it starts, its enemies stand on the blue side, and it has a script', () => {
  for (const m of STORY_MISSIONS) {
    const s = start(m);
    assert.ok(enemies(s).length > 0, m.id);
    assert.ok(hero(s).alive, m.id);
    assert.ok(MISSION_SCRIPTS[m.id], `${m.id} has a script`);
    run(s, 2000);
    assert.equal(s.outcome(), null, `${m.id} goes on`);
  }
});
