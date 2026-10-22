import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLAT_LEVEL_CAP_REWARD, LEVEL_CAP, REFERRAL_TIERS, blatForLevel, blatForLevelsUpTo, dropCountdown, dropMsLeft, isRefCode, referralReward } from '../index.js';

test('$BLAT for levels: 300, 350, 400… growing to 10 000 and staying there (the draft table)', () => {
  assert.deepEqual([1, 2, 3, 10, 11, 20, 30, 40, 50, 51, 99].map(blatForLevel), [300, 350, 400, 750, 850, 1750, 3750, 6750, 10_000, 10_000, 10_000]);
  assert.equal(blatForLevel(0), 0);
  assert.equal(blatForLevel(-3), 0);
  for (let l = 2; l <= LEVEL_CAP; l++) assert.ok(blatForLevel(l) >= blatForLevel(l - 1), `never less than the level before (${l})`);
  assert.ok(Array.from({ length: LEVEL_CAP }, (_, i) => blatForLevel(i + 1)).every((r) => r % 25 === 0 && r <= BLAT_LEVEL_CAP_REWARD));
  assert.equal(blatForLevelsUpTo(3), 1050);
});

test('$BLAT for referrals: the owner’s scale by the invitation’s number (1–4: 1 500 … 500+: 20 000)', () => {
  const pay = (n: number) => referralReward(n);
  assert.deepEqual([1, 4, 5, 9, 10, 24, 25, 49, 50, 99, 100, 249, 250, 499, 500, 5000].map(pay), [1500, 1500, 3000, 3000, 5000, 5000, 7500, 7500, 10_000, 10_000, 12_500, 12_500, 15_000, 15_000, 20_000, 20_000]);
  // the owner's example: four at 1 500, five at 3 000, three at 5 000
  let sum = 0;
  for (let n = 1; n <= 12; n++) sum += pay(n);
  assert.equal(sum, 4 * 1500 + 5 * 3000 + 3 * 5000);
  assert.equal(REFERRAL_TIERS[0]!.from, 1);
  assert.ok(isRefCode('Ab12Cd34') && isRefCode('streamer_name') && !isRefCode('a b') && !isRefCode('x') && !isRefCode(42));
});

test('BLAT DROP countdown: by the server’s clock — a device clock ten minutes off counts to the same second; never below zero', () => {
  const at = '2027-04-23T12:00:00.000Z';
  const server = '2026-10-23T12:00:00.000Z';
  const exact = Date.parse(server);
  const right = dropMsLeft(at, server, exact, exact + 5000);
  const fast = dropMsLeft(at, server, exact + 600_000, exact + 600_000 + 5000);
  const slow = dropMsLeft(at, server, exact - 3_600_000, exact - 3_600_000 + 5000);
  assert.equal(fast, right);
  assert.equal(slow, right);
  assert.deepEqual(dropCountdown(right), { d: 181, h: 23, m: 59, s: 55 });
  assert.deepEqual(dropCountdown(-5000), { d: 0, h: 0, m: 0, s: 0 });
  assert.deepEqual(dropCountdown(Number.NaN), { d: 0, h: 0, m: 0, s: 0 });
  assert.deepEqual(dropCountdown(90_061_000), { d: 1, h: 1, m: 1, s: 1 });
});
