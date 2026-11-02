import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLATS_PER_LEVEL,
  CHARACTERS,
  CHARACTER_IDS,
  CHARACTER_PRICES,
  DIAMOND_PACKS,
  FINISHES,
  FINISH_IDS,
  FREE_CHARACTERS,
  FREE_FINISHES,
  GRADES,
  GRADE_COLORS,
  REAL_MONEY,
  REFERRAL_TALONS,
  SKIN_CASE_PRICE,
  SKIN_RARITY_CHANCE,
  blatsForLevel,
  blatsToUsd,
  buyRefusal,
  isRefCode,
  ownsSkin,
  skinBuyRefusal,
  skinPrice,
} from '../index.js';
import type { CharacterId, Inventory } from '../index.js';

test('v0.2.18 roster: 2 free, 3 for talons, the rest for BLATS by grade (199 / 399 / 799 / 1 099)', () => {
  assert.deepEqual([...FREE_CHARACTERS], ['petya', 'valuta']);
  const talons = CHARACTER_IDS.filter((c) => CHARACTER_PRICES[c]?.currency === 'tokens');
  assert.deepEqual(talons, ['uchastkovy', 'mihalych', 'vorona']);
  const want = { common: 199, rare: 399, epic: 799, legendary: 1099 } as const;
  for (const c of CHARACTER_IDS) {
    if (FREE_CHARACTERS.includes(c) || talons.includes(c)) continue;
    const p = CHARACTER_PRICES[c]!;
    assert.equal(p.currency, 'diamonds', c);
    assert.equal(p.amount, want[CHARACTERS[c].grade], c);
    assert.equal(p.level, 1, `${c}: no level needed`);
  }
  // the owner's grades of the existing roster
  const byGrade = (g: string) => CHARACTER_IDS.filter((c) => CHARACTERS[c].grade === g && !FREE_CHARACTERS.includes(c) && !talons.includes(c)).length;
  assert.deepEqual([byGrade('common'), byGrade('rare'), byGrade('epic'), byGrade('legendary')], [9, 7, 2, 1]);
  const named = (ids: CharacterId[], g: string) => ids.every((c) => CHARACTERS[c].grade === g);
  assert.ok(named(['lev'], 'legendary') && named(['akula', 'gorilla'], 'epic') && named(['leopard', 'oryol', 'lisa', 'nosorog', 'slon', 'buyvol', 'koshka'], 'rare'));
});

test('v0.2.18 grades: four, coloured grey / red / purple / gold', () => {
  assert.deepEqual([...GRADES], ['common', 'rare', 'epic', 'legendary']);
  assert.equal(new Set(Object.values(GRADE_COLORS)).size, 4);
});

test('v0.2.18 skins: two free finishes, the rest by grade (99 / 199 / 299 / 499 BLATS)', () => {
  assert.deepEqual([...FREE_FINISHES], ['berezka', 'rzhavchina']);
  const want = { common: 99, rare: 199, epic: 299, legendary: 499 } as const;
  for (const f of FINISH_IDS) {
    const p = skinPrice(f);
    if (FREE_FINISHES.includes(f)) assert.equal(p, null, f);
    else assert.deepEqual(p, { currency: 'diamonds', amount: want[FINISHES[f].rarity], level: 1 }, f);
  }
  const inv = { skins: ['avtomat.gzhel'], diamonds: 150 };
  assert.ok(ownsSkin(inv.skins, 'avtomat', 'berezka') && ownsSkin(new Set(inv.skins), 'avtomat', 'gzhel') && !ownsSkin(inv.skins, 'pistol', 'gzhel'));
  assert.equal(skinBuyRefusal(inv, 'avtomat', 'berezka'), 'owned');
  assert.equal(skinBuyRefusal(inv, 'avtomat', 'gzhel'), 'owned');
  assert.equal(skinBuyRefusal(inv, 'pistol', 'zima'), null);
  assert.equal(skinBuyRefusal(inv, 'pistol', 'gzhel'), 'funds');
});

test('v0.2.18 BLATS: on sale, 1 BLATS = 1 cent, packs from 99, 10 for every new level, the skin case 299', () => {
  assert.equal(REAL_MONEY, true);
  assert.equal(DIAMOND_PACKS[0]!.diamonds, 99);
  for (const p of DIAMOND_PACKS) assert.equal(p.usdCents, p.diamonds, p.id);
  assert.deepEqual([blatsToUsd(199), blatsToUsd(1099), blatsToUsd(99)], ['$1.99', '$10.99', '$0.99']);
  assert.deepEqual([blatsForLevel(1), blatsForLevel(2), blatsForLevel(57), blatsForLevel(0)], [0, BLATS_PER_LEVEL, BLATS_PER_LEVEL, 0]);
  assert.equal(BLATS_PER_LEVEL, 10);
  assert.deepEqual(SKIN_CASE_PRICE, { currency: 'diamonds', amount: 299, level: 1 });
  assert.deepEqual([SKIN_RARITY_CHANCE.common, SKIN_RARITY_CHANCE.rare, SKIN_RARITY_CHANCE.epic, SKIN_RARITY_CHANCE.legendary], [40, 30, 20, 10]);
  const inv = (diamonds: number): Inventory => ({ tokens: 0, diamonds, level: 1, weapons: [], characters: ['petya', 'valuta'], gadgets: [], mods: {}, skins: [], loadout: {} as Inventory['loadout'] });
  assert.equal(buyRefusal(inv(1098), 'character', 'lev'), 'funds');
  assert.equal(buyRefusal(inv(1099), 'character', 'lev'), null);
});

test('invitations pay talons; codes', () => {
  assert.equal(REFERRAL_TALONS, 150);
  assert.ok(isRefCode('Ab12Cd34') && isRefCode('streamer_name') && !isRefCode('a b') && !isRefCode('x') && !isRefCode(42));
});
