import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOADOUT,
  FINISHES,
  FINISH_IDS,
  SKIN_RARITIES,
  SKIN_RARITY_CHANCE,
  WEAPON_IDS,
  allSkins,
  drawSkin,
  fillPersona,
  isSkinId,
  parseSkin,
  sanitizeLoadout,
  sanitizeSkins,
  skinCaseOdds,
  skinId,
} from '../index.js';
import type { FinishId, SkinRarity, WeaponId } from '../index.js';

/** Deterministic uniform numbers in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('ten finishes over four rarities; every weapon wears every finish; ids round-trip', () => {
  assert.equal(FINISH_IDS.length, 10);
  assert.deepEqual(new Set(FINISH_IDS.map((f) => FINISHES[f].rarity)), new Set(SKIN_RARITIES));
  assert.equal(SKIN_RARITIES.reduce((s, r) => s + SKIN_RARITY_CHANCE[r], 0), 100);
  assert.equal(allSkins().length, WEAPON_IDS.length * FINISH_IDS.length);
  assert.deepEqual(parseSkin(skinId('avtomat', 'hohloma')), { weapon: 'avtomat', finish: 'hohloma' });
  for (const bad of ['avtomat', 'avtomat.', '.hohloma', 'avtomat.gold', 'laser.hohloma', 'avtomat.hohloma.x', 42, null]) assert.equal(isSkinId(bad), false, String(bad));
  for (const id of allSkins()) assert.match(id, /^[a-z0-9_]{2,24}\.[a-z0-9_]{2,24}$/, 'fits the database check');
});

test('the skin case never repeats a skin, follows the rarity odds and ends when the collection is complete', () => {
  const owned = new Set<string>();
  const rand = rng(7);
  const counts: Record<SkinRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 200; i++) {
    const d = drawSkin(owned, rand)!;
    const id = skinId(d.weapon, d.finish);
    assert.ok(!owned.has(id), 'no duplicates');
    assert.equal(FINISHES[d.finish].rarity, d.rarity);
    owned.add(id);
    counts[d.rarity]++;
  }
  // 200 draws from a large collection: the shares are near 55 / 28 / 13 / 4
  assert.ok(counts.common > 85 && counts.common < 135, JSON.stringify(counts));
  assert.ok(counts.rare > 35 && counts.rare < 80, JSON.stringify(counts));
  assert.ok(counts.legendary < 20, JSON.stringify(counts));
  // everything but one legendary skin owned: the last draw must be that skin, then nothing
  const last = skinId('granatomet', 'yantar');
  const nearlyAll = new Set(allSkins().filter((s) => s !== last));
  const odds = skinCaseOdds(nearlyAll);
  assert.deepEqual([odds.common, odds.rare, odds.epic, odds.legendary], [0, 0, 0, 100]);
  const d = drawSkin(nearlyAll, rng(1))!;
  assert.equal(skinId(d.weapon, d.finish), last);
  nearlyAll.add(last);
  assert.equal(drawSkin(nearlyAll, rng(2)), null);
  assert.deepEqual(Object.values(skinCaseOdds(nearlyAll)), [0, 0, 0, 0]);
});

test('equipped skins are sanitised: known weapons and finishes, owned ones only', () => {
  const owns = (w: WeaponId, f: FinishId) => w === 'avtomat' && f === 'zoloto';
  assert.deepEqual(sanitizeSkins({ avtomat: 'zoloto', pistol: 'zoloto', laser: 'zoloto', obrez: 'nope' }, owns), { avtomat: 'zoloto' });
  assert.deepEqual(sanitizeSkins('junk'), {});
  assert.deepEqual(sanitizeSkins([1, 2]), {});
  const l = sanitizeLoadout({ ...DEFAULT_LOADOUT, skins: { avtomat: 'zoloto', pistol: 'gzhel' } }, { skin: owns });
  assert.deepEqual(l.skins, { avtomat: 'zoloto' });
  assert.deepEqual(sanitizeLoadout({}).skins, {});
});

test('filled players sometimes wear a skin on a weapon they carry', () => {
  const rand = rng(99);
  let withSkin = 0;
  for (let i = 0; i < 400; i++) {
    const p = fillPersona(rand, { lang: 'en', aroundLevel: 5, taken: new Set() });
    const skins = p.loadout.skins ?? {};
    for (const [w, f] of Object.entries(skins)) {
      assert.ok([p.loadout.primary, p.loadout.sidearm].includes(w as WeaponId), 'only on a weapon it carries');
      assert.ok(FINISH_IDS.includes(f as FinishId));
    }
    if (Object.keys(skins).length) withSkin++;
  }
  assert.ok(withSkin > 80 && withSkin < 200, `${withSkin} of 400`);
});
