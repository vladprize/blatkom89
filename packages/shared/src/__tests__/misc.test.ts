import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeInputs, decodeInputs, encodeSnapshot, decodeSnapshot, ProtocolError } from '../net/codec.js';
import { makeWorld, startDuel, input, BTN } from './helpers.js';
import { getMap, getCollision, MAP_ORDER } from '../maps/index.js';
import { NavGrid } from '../sim/nav.js';
import { PLAYER_RADIUS } from '../constants/game.js';
import { levelForXp, totalXpForLevel, xpForMatch, evaluateAchievements, XP_RULES, rankPlaces, isWin, applyMatchProgress, ACHIEVEMENTS, ACHIEVEMENT_IDS } from '../game-rules/progression.js';
import type { AchievementId } from '../game-rules/progression.js';
import { World } from '../sim/world.js';
import { BotBrain } from '../sim/bots.js';
import { ClientMessageSchema } from '../net/protocol.js';

test('codec: inputs round-trip', () => {
  const frames = [input({ moveX: 127, moveY: -127, aim: 12345, buttons: BTN.FIRE | BTN.WALK, slot: 3, viewTime: 98765 })];
  const out = decodeInputs(encodeInputs(frames));
  assert.deepEqual(out, frames);
});

test('codec: malformed inputs are rejected', () => {
  assert.throws(() => decodeInputs(new Uint8Array([1])), ProtocolError);
  assert.throws(() => decodeInputs(new Uint8Array([1, 9])), ProtocolError);
  const badSlot = new Uint8Array(encodeInputs([input({})]));
  badSlot[11] = 9; // slot > 3
  assert.throws(() => decodeInputs(badSlot), ProtocolError);
  const badButtons = new Uint8Array(encodeInputs([input({})]));
  badButtons[10] = 0x40;
  assert.throws(() => decodeInputs(badButtons), ProtocolError);
  const badAxis = new Uint8Array(encodeInputs([input({})]));
  badAxis[6] = 0x80; // -128
  assert.throws(() => decodeInputs(badAxis), ProtocolError);
  const bad = new Uint8Array(encodeInputs([input({})]));
  assert.throws(() => decodeInputs(bad.slice(0, bad.length - 1)), ProtocolError);
});

test('codec: snapshot round-trip keeps state within quantization', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 60.3, y: 50.7 }, { x: 160, y: 50 });
  w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0.5 }));
  const events = w.drainEvents();
  const buf = encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 1000, players: w.players.values(), pickups: w.pickups, gadgets: w.gadgets, events, now: w.time });
  const s = decodeSnapshot(buf);
  assert.equal(s.players.length, 2);
  const np = s.players.find((p) => p.slot === p1.slot)!;
  assert.ok(Math.abs(np.x - p1.x) <= 0.125);
  assert.ok(Math.abs(np.y - p1.y) <= 0.125);
  assert.equal(np.sideMag, p1.sideMag);
  assert.equal(s.shots.length, 1);
  assert.equal(s.phase, 'active');
  assert.throws(() => decodeSnapshot(new Uint8Array(buf).slice(0, 20)), ProtocolError);
});

test('protocol: client JSON messages are validated', () => {
  assert.equal(ClientMessageSchema.safeParse({ type: 'ready', ready: true }).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'ready', ready: 'yes' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'map', mapId: 'moon' }).success, false);
  assert.equal(ClientMessageSchema.safeParse({ type: 'hack' }).success, false);
});

for (const id of MAP_ORDER) {
  test(`maps: ${id} spawns are valid, reachable and separated`, () => {
    const m = getMap(id);
    const c = getCollision(id);
    const nav = new NavGrid(c);
    assert.ok(m.spawns.length >= 12, 'at least 12 spawns for 10 players');
    const s0 = m.spawns[0]!;
    const reach = nav.flood(nav.index(s0.x, s0.y));
    for (const s of m.spawns) {
      assert.ok(s.x > PLAYER_RADIUS && s.y > PLAYER_RADIUS && s.x < m.width - PLAYER_RADIUS && s.y < m.height - PLAYER_RADIUS, 'inside bounds');
      assert.equal(c.overlapsCircle(s.x, s.y, PLAYER_RADIUS), false, `spawn ${s.x},${s.y} not inside solids`);
      assert.equal(reach[nav.index(s.x, s.y)], 1, `spawn ${s.x},${s.y} reachable`);
    }
    for (let i = 0; i < m.spawns.length; i++)
      for (let j = i + 1; j < m.spawns.length; j++) {
        const a = m.spawns[i]!;
        const b = m.spawns[j]!;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 60, 'spawns are not stacked');
      }
    assert.ok(m.pickups.length >= 8, 'plenty of weapon pickups');
    for (const p of m.pickups) {
      const k = nav.nearestWalkable(p.x, p.y, 2);
      assert.ok(k >= 0 && reach[k] === 1, `pickup ${p.x},${p.y} reachable`);
      assert.equal(c.overlapsCircle(p.x, p.y, 10), false, `pickup ${p.x},${p.y} not inside solids`);
    }
    assert.ok(m.medkits.length >= 3, 'first-aid kits on every map');
    for (const p of m.medkits) {
      assert.equal(c.overlapsCircle(p.x, p.y, 12), false, `medkit ${p.x},${p.y} not inside solids`);
      assert.equal(reach[nav.index(p.x, p.y)], 1, `medkit ${p.x},${p.y} reachable`);
      for (const q of m.pickups) assert.ok(Math.hypot(q.x - p.x, q.y - p.y) > 60, `medkit ${p.x},${p.y} not on a weapon pickup`);
      for (const q of m.supplyPoints) assert.ok(Math.hypot(q.x - p.x, q.y - p.y) >= 48, `medkit ${p.x},${p.y} keeps supply point ${q.x},${q.y} free`);
    }
    assert.ok(m.supplyPoints.length >= 5, 'supply drop points');
    for (const p of m.supplyPoints) {
      assert.equal(c.overlapsCircle(p.x, p.y, 14), false, `supply ${p.x},${p.y} not inside solids`);
      assert.equal(reach[nav.index(p.x, p.y)], 1, `supply ${p.x},${p.y} reachable`);
    }
  });
}

test('maps: spawn selection avoids visible opponents', () => {
  const m = getMap('factory');
  const w = new World(m, getCollision('factory'), { lagCompensation: false });
  const enemy = w.addPlayer('e', 'E', 'petya');
  w.addPlayer('me', 'Me', 'valuta');
  enemy.alive = true;
  const s0 = m.spawns[0]!;
  enemy.x = s0.x + 15;
  enemy.y = s0.y;
  for (let k = 0; k < 20; k++) {
    const i = w.chooseSpawn('me');
    const s = m.spawns[i]!;
    assert.ok(Math.hypot(s.x - enemy.x, s.y - enemy.y) > 200);
  }
});

test('maps: water and iron railings stop movement but not bullets; headstones stop both', () => {
  // the lake in the pioneer camp (y 900–1000), straight down from the sand at x 500
  const camp = getCollision('camp');
  assert.equal(camp.raycast(500, 860, 0, 1, 120, 'shot'), null, 'a bullet flies over the water');
  const swim = camp.raycast(500, 860, 0, 1, 120, 'move');
  assert.ok(swim && Math.abs(860 + swim.t - 900) < 1, 'nobody walks into the lake');
  assert.ok(camp.overlapsCircle(500, 930, PLAYER_RADIUS));
  // a family plot in the cemetery: the railing at y 250, headstones at (264|292, 272)
  const cem = getCollision('cemetery');
  assert.equal(cem.raycast(280, 230, 0, 1, 40, 'shot'), null, 'a bullet passes the railing between two headstones');
  const fence = cem.raycast(280, 230, 0, 1, 40, 'move');
  assert.ok(fence && Math.abs(230 + fence.t - 250) < 1, 'the railing stops a walker');
  const stone = cem.raycast(292, 230, 0, 1, 60, 'shot');
  assert.ok(stone && Math.abs(230 + stone.t - 268) < 1, 'a headstone stops the bullet');
  // the fortress wall on the square is solid
  assert.ok(getCollision('square').raycast(400, 200, 0, -1, 150, 'shot'));
});

test('progression: xp, levels and achievements', () => {
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(levelForXp(0).level, 1);
  assert.equal(levelForXp(totalXpForLevel(5)).level, 5);
  assert.equal(levelForXp(totalXpForLevel(5) - 1).level, 4);
  const xp = xpForMatch({ kills: 3, deaths: 1, place: 1, playersAtEnd: 4, completed: true, withFriends: true });
  assert.equal(xp, XP_RULES.completion + 30 + 100 + XP_RULES.playedWithFriends);
  assert.equal(xpForMatch({ kills: 3, deaths: 1, place: 1, playersAtEnd: 4, completed: false, withFriends: false }), 0);
  const got = evaluateAchievements(
    { matchesCompleted: 1, wins: 1, currentWinStreak: 1 },
    { kills: 5, deaths: 0, place: 1, playersAtEnd: 2, completed: true, withFriends: true },
    new Set(),
  );
  // v0.3: a win without a death is «Untouchable» too
  assert.deepEqual(got.sort(), ['first_match', 'first_win', 'flawless', 'multi_kill', 'played_with_friends']);
  const again = evaluateAchievements({ matchesCompleted: 2, wins: 2, currentWinStreak: 2 }, { kills: 0, deaths: 0, place: 1, playersAtEnd: 2, completed: true, withFriends: false }, new Set(got));
  assert.deepEqual(again, []);
});

test('bots: a 4-bot match on every map runs and produces eliminations', () => {
  for (const id of MAP_ORDER) {
    const w = new World(getMap(id), getCollision(id), { lagCompensation: false, config: { readyMs: 0, countdownMs: 0 } });
    const nav = new NavGrid(w.collision);
    const brains = ['b1', 'b2', 'b3', 'b4'].map((bid, i) => {
      w.addPlayer(bid, bid, (['petya', 'valuta', 'uchastkovy', 'mihalych'] as const)[i]!, true);
      return new BotBrain(bid, w, nav, 'hard', i + 7);
    });
    w.beginMatch(true);
    let kills = 0;
    for (let t = 0; t < 60 * 90; t++) {
      for (const b of brains) w.applyInput(b.id, b.nextInput());
      w.update();
      kills += w.drainEvents().filter((e) => e.t === 'kill').length;
    }
    assert.ok(kills > 0, `${id}: bots got ${kills} kills in 90s`);
  }
});

test('standings: equal results share a place and a draw is nobody\'s win', () => {
  const r = (score: number, kills: number, deaths: number) => ({ score, kills, deaths });
  assert.deepEqual(rankPlaces([r(6, 3, 1), r(6, 3, 1), r(6, 2, 0), r(2, 1, 0), r(2, 1, 2)]), [1, 1, 3, 4, 5]);
  assert.deepEqual(rankPlaces([r(0, 0, 0), r(0, 0, 0)]), [1, 1]);
  const base = { kills: 0, deaths: 0, place: 1, playersAtEnd: 2, completed: true, withFriends: false };
  assert.equal(isWin(base), true);
  assert.equal(isWin({ ...base, sharedPlace: true }), false);
  assert.equal(isWin({ ...base, playersAtEnd: 1 }), false);
  assert.equal(isWin({ ...base, completed: false }), false);
  assert.ok(!evaluateAchievements({ matchesCompleted: 1, wins: 0, currentWinStreak: 0 }, { ...base, sharedPlace: true }, new Set()).includes('first_win'));
  // a fresh world where nobody scored: everyone shares first place
  const w = new World(getMap('factory'), getCollision('factory'));
  w.addPlayer('a', 'A', 'petya', false);
  w.addPlayer('b', 'B', 'valuta', false);
  assert.deepEqual(w.standings().map((s) => s.place), [1, 1]);
});

test('progression: applyMatchProgress (shared by the server recorder and the demo profile)', () => {
  const fresh = { xp: 0, level: 1, matchesCompleted: 0, wins: 0, currentWinStreak: 0 };
  // first match, sole first place among 4, 6 eliminations and 2 assists
  const win = applyMatchProgress(fresh, { kills: 6, assists: 2, deaths: 1, place: 1, playersAtEnd: 4, completed: true, withFriends: false }, new Set());
  assert.equal(win.won, true);
  assert.equal(win.lost, false);
  assert.equal(win.streak, 1);
  assert.deepEqual(win.unlocked.sort(), ['first_match', 'first_win', 'multi_kill']);
  const matchXp = XP_RULES.completion + 6 * XP_RULES.perKill + 2 * XP_RULES.perAssist + XP_RULES.placement[0]!;
  const reward = ACHIEVEMENTS.first_match.xpReward + ACHIEVEMENTS.first_win.xpReward + ACHIEVEMENTS.multi_kill.xpReward;
  assert.equal(win.xpGained, matchXp + reward);
  assert.equal(win.totalXp, win.xpGained);
  assert.equal(win.level, levelForXp(win.totalXp).level);
  assert.equal(win.leveledUp, win.level > 1);
  // a shared first place is a loss for the streak and unlocks nothing already owned
  const owned = new Set(win.unlocked);
  const draw = applyMatchProgress({ ...fresh, xp: win.totalXp, level: win.level, matchesCompleted: 1, wins: 1, currentWinStreak: 1 }, { kills: 1, assists: 0, deaths: 1, place: 1, playersAtEnd: 2, completed: true, withFriends: false, sharedPlace: true }, owned);
  assert.equal(draw.won, false);
  assert.equal(draw.lost, true);
  assert.equal(draw.streak, 0);
  assert.deepEqual(draw.unlocked, []);
  // leaving early gives nothing and resets the streak
  const left = applyMatchProgress({ ...fresh, currentWinStreak: 2 }, { kills: 3, deaths: 0, place: 1, playersAtEnd: 3, completed: false, withFriends: false }, new Set());
  assert.equal(left.xpGained, 0);
  assert.equal(left.streak, 0);
  assert.equal(left.lost, false);
});

test('achievements v0.3: twenty from matches (and the story’s chapters), each with a title, a description and a reward; feats, team play and levels unlock as described', () => {
  // v0.2.13: the story's chapter achievements come on top (paid by the story, never by a match)
  assert.equal(ACHIEVEMENT_IDS.filter((id) => !id.startsWith('story_')).length, 20);
  assert.deepEqual(ACHIEVEMENT_IDS.filter((id) => id.startsWith('story_')), ['story_petya_1', 'story_uchastkovy_1', 'story_petya_2', 'story_uchastkovy_2']);
  for (const id of ACHIEVEMENT_IDS) {
    const a = ACHIEVEMENTS[id];
    assert.ok(a && a.id === id && a.title && a.description && a.xpReward > 0, id);
  }
  const base = { kills: 0, assists: 0, deaths: 0, place: 2, playersAtEnd: 4, completed: true, withFriends: false };
  const none = new Set<AchievementId>();
  const after = { matchesCompleted: 1, wins: 0, currentWinStreak: 0 };
  // a flawless solo win with ten eliminations
  let got = evaluateAchievements({ ...after, wins: 1, currentWinStreak: 1 }, { ...base, place: 1, kills: 10 }, none);
  assert.ok(got.includes('kills_10') && got.includes('flawless') && got.includes('first_win') && !got.includes('comeback'), got.join());
  // a comeback: won after five deaths
  got = evaluateAchievements({ ...after, wins: 1 }, { ...base, place: 1, deaths: 5 }, none);
  assert.ok(got.includes('comeback') && !got.includes('flawless'));
  // team win, objectives, assists
  got = evaluateAchievements(after, { ...base, teamOutcome: 'win', objectives: 3, assists: 5 }, none);
  assert.ok(['team_win', 'objective', 'objectives_3', 'assists_5'].every((id) => got.includes(id as AchievementId)), got.join());
  // a loss gives neither the team win nor «untouchable»
  got = evaluateAchievements(after, { ...base, teamOutcome: 'loss' }, none);
  assert.ok(!got.includes('team_win') && !got.includes('flawless'));
  // long-term counters
  got = evaluateAchievements({ matchesCompleted: 100, wins: 50, currentWinStreak: 5 }, base, none);
  assert.ok(['matches_50', 'matches_100', 'wins_10', 'wins_50', 'streak_5'].every((id) => got.includes(id as AchievementId)), got.join());
  // levels: reached through the match's experience in applyMatchProgress
  const prev = { xp: totalXpForLevel(10) - 60, level: 9, matchesCompleted: 3, wins: 0, currentWinStreak: 0 };
  const o = applyMatchProgress(prev, { ...base }, new Set<AchievementId>(['first_match']));
  assert.ok(o.unlocked.includes('level_10') && o.level >= 10, JSON.stringify(o));
  assert.equal(o.xpGained, xpForMatch(base) + ACHIEVEMENTS.level_10.xpReward);
  // already owned achievements are never given twice
  const again = applyMatchProgress({ ...prev, xp: o.totalXp, level: o.level }, base, new Set<AchievementId>(['first_match', 'level_10']));
  assert.ok(!again.unlocked.includes('level_10'));
});
