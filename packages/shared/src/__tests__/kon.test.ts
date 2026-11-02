import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MATCH_CONFIG, KON_FORMATS, KON_RATING, KON_RULES, isKonFormat, konConfig, konDeal, konDelta, konExpected } from '../index.js';

test('Блатной кон: four formats with fixed sides, team deathmatch, nobody joins a match that is on', () => {
  assert.deepEqual([...KON_FORMATS], ['1x1', '2x2', '3x3', '5x5']);
  assert.ok(isKonFormat('3x3') && !isKonFormat('4x4') && !isKonFormat(3));
  const base = { ...DEFAULT_MATCH_CONFIG, durationMs: 240_000 };
  const sizes = KON_FORMATS.map((f) => {
    const c = konConfig(base, f);
    assert.equal(c.mode, 'teams');
    assert.equal(c.allowJoinInProgress, false);
    assert.equal(c.minPlayers, c.maxPlayers, 'starts only full');
    assert.equal(c.teamScoreLimit, KON_RULES[f].teamScoreLimit);
    return [c.maxPlayers, c.durationMs / 60_000];
  });
  assert.deepEqual(sizes, [[2, 3], [4, 4], [6, 4], [10, 5]]);
  // the E2E server's 40-second matches scale the same way
  assert.equal(konConfig({ ...base, durationMs: 40_000 }, '1x1').durationMs, 30_000);
});

test('Kon rating: Elo — equal sides move by half of K, an upset moves more, the first matches more, draws even', () => {
  assert.equal(konExpected(1000, 1000), 0.5);
  assert.ok(Math.abs(konExpected(1200, 1000) - 0.76) < 0.01);
  assert.equal(konDelta({ mine: 1000, theirs: 1000, outcome: 'win', matches: 20 }), KON_RATING.k / 2);
  assert.equal(konDelta({ mine: 1000, theirs: 1000, outcome: 'loss', matches: 20 }), -KON_RATING.k / 2);
  assert.equal(konDelta({ mine: 1000, theirs: 1000, outcome: 'draw', matches: 20 }), 0);
  assert.equal(konDelta({ mine: 1000, theirs: 1000, outcome: 'win', matches: 0 }), KON_RATING.kNew / 2);
  const upset = konDelta({ mine: 900, theirs: 1200, outcome: 'win', matches: 20 });
  const expected = konDelta({ mine: 1200, theirs: 900, outcome: 'win', matches: 20 });
  assert.ok(upset > 18 && expected < 6, `${upset} / ${expected}`);
  assert.ok(konDelta({ mine: 900, theirs: 1200, outcome: 'draw', matches: 20 }) > 0, 'a draw against stronger players gains');
});

test('Kon search deals even sides: the strongest first — red, blue, blue, red…', () => {
  const players = [1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600].map((rating, i) => ({ id: `p${i}`, rating }));
  const teams = konDeal(players);
  const sum = (t: 0 | 1) => players.filter((p) => teams.get(p.id) === t).reduce((a, p) => a + p.rating, 0);
  assert.equal([...teams.values()].filter((t) => t === 0).length, 5);
  assert.ok(Math.abs(sum(0) - sum(1)) <= 300, `${sum(0)} vs ${sum(1)}`);
  assert.deepEqual([teams.get('p0'), teams.get('p1'), teams.get('p2'), teams.get('p3')], [0, 1, 1, 0]);
  const two = konDeal([{ id: 'a', rating: 1000 }, { id: 'b', rating: 1000 }]);
  assert.notEqual(two.get('a'), two.get('b'));
});
