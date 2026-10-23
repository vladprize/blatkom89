import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MATCH_CONFIG, KON_FORMATS, KON_RATING, KON_RULES, KON_STAKES, isKonFormat, konConfig, konDeal, konDelta, konExpected, settleStakes, stakesAllowed } from '../index.js';

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

test('Kon stakes are designed and OFF: the settlement rule shares the pool exactly, refunds draws and failures', () => {
  assert.equal(KON_STAKES.enabled, false);
  assert.equal(stakesAllowed(), false);
  // the owner's example: 3×3, 5 000 each → a pool of 30 000, 10 000 to each winner
  const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, team: (i < 3 ? 0 : 1) as 0 | 1 }));
  const win = settleStakes({ stake: 5000, players, winner: 0, failed: false });
  assert.equal(win.kind, 'pool');
  assert.equal(win.pool, 30_000);
  assert.deepEqual([...win.payouts.values()], [10_000, 10_000, 10_000, 0, 0, 0]);
  const draw = settleStakes({ stake: 5000, players, winner: null, failed: false });
  assert.deepEqual([draw.kind, [...draw.payouts.values()]], ['refund', [5000, 5000, 5000, 5000, 5000, 5000]]);
  const failed = settleStakes({ stake: 5000, players, winner: 1, failed: true });
  assert.equal(failed.kind, 'refund');
  // what doesn't divide goes one by one to the winners in id order — nothing is created or lost
  const odd = settleStakes({ stake: 101, players: [{ id: 'z', team: 0 }, { id: 'y', team: 0 }, { id: 'x', team: 0 }, { id: 'w', team: 1 }], winner: 0, failed: false });
  assert.equal([...odd.payouts.values()].reduce((a, b) => a + b, 0), odd.pool);
  assert.deepEqual([odd.payouts.get('x'), odd.payouts.get('y'), odd.payouts.get('z'), odd.payouts.get('w')], [135, 135, 134, 0]);
});
