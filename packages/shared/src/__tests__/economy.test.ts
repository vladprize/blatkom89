import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLATS_PER_LEVEL,
  CASE_CHARACTERS,
  CASE_FINISHES,
  CHARACTER_CASE_PRICE,
  characterCaseOdds,
  drawCharacter,
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
  LINE_FINISHES,
  REAL_MONEY,
  REFERRAL_TALONS,
  SHOP_FINISHES,
  SKINNABLE_WEAPONS,
  SKIN_CASE_PRICE,
  SKIN_RARITY_CHANCE,
  WELCOME_FINISHES,
  blatsForLevel,
  blatsToUsd,
  buyRefusal,
  drawSkin,
  isRefCode,
  lineSkins,
  ownsSkin,
  parseSkin,
  skinBuyRefusal,
  skinPrice,
  welcomeSkins,
} from '../index.js';
import type { CharacterId, Inventory } from '../index.js';

test('v0.2.18 roster: 2 free, 3 for talons, the rest for BLATS by grade (v0.2.24: 99 / 299 / 499 / 699)', () => {
  assert.deepEqual([...FREE_CHARACTERS], ['petya', 'valuta']);
  const talons = CHARACTER_IDS.filter((c) => CHARACTER_PRICES[c]?.currency === 'tokens');
  assert.deepEqual(talons, ['uchastkovy', 'mihalych', 'vorona']);
  const want = { common: 99, rare: 299, epic: 499, legendary: 699 } as const;
  for (const c of CHARACTER_IDS) {
    if (FREE_CHARACTERS.includes(c) || talons.includes(c)) continue;
    const p = CHARACTER_PRICES[c]!;
    assert.equal(p.currency, 'diamonds', c);
    assert.equal(p.amount, want[CHARACTERS[c].grade], c);
    assert.equal(p.level, 1, `${c}: no level needed`);
  }
  // the owner's grades of the existing roster
  const byGrade = (g: string) => CHARACTER_IDS.filter((c) => CHARACTERS[c].grade === g && !FREE_CHARACTERS.includes(c) && !talons.includes(c)).length;
  // v0.2.18 part 2: + the twelve of the owner's later sheets — 2 regular, 4 rare, 4 epic, 2 legendary
  assert.deepEqual([byGrade('common'), byGrade('rare'), byGrade('epic'), byGrade('legendary')], [11, 11, 6, 3]);
  const named = (ids: CharacterId[], g: string) => ids.every((c) => CHARACTERS[c].grade === g);
  assert.ok(named(['lev'], 'legendary') && named(['akula', 'gorilla'], 'epic') && named(['leopard', 'oryol', 'lisa', 'nosorog', 'slon', 'buyvol', 'koshka'], 'rare'));
  assert.ok(named(['kasatka', 'zvezda'], 'legendary') && named(['tigr', 'pauk', 'bogomol', 'ezh'], 'epic') && named(['vasilisk', 'lenivec', 'kozel', 'pingvin'], 'rare') && named(['zaychiha', 'zayac'], 'common'));
});

test('v0.2.18 grades: four, coloured grey / red / purple / gold', () => {
  assert.deepEqual([...GRADES], ['common', 'rare', 'epic', 'legendary']);
  assert.equal(new Set(Object.values(GRADE_COLORS)).size, 4);
});

test('v0.2.19 skins: the owner\'s line — 39 on sale by grade (v0.2.24: 99 / 99 / 199 / 299 BLATS), 2 welcome gifts, the first line retired', () => {
  // the line, in the owner's order: 2 regular on sale + the 2 gifts, 10 rare, 5 epic, 3 legendary; then the
  // AK sheet of v0.2.19 (5 rare, 8 epic, 6 legendary)
  assert.deepEqual([...LINE_FINISHES], [
    'haki', 'iznos', 'akulka', 'blatkom', 'sparta', 'sport', 'devyanostye', 'malina', 'video', 'cherkizon', 'radiaciya', 'afgan', 'tatu', 'plenka', 'kosmos', 'zakat', 'hohloma', 'elektronika', 'led', 'carsky', 'kontora', 'yadernaya',
    'bratok', 'korol', 'neon', 'shashlyk', 'graffiti', 'peklo', 'kilka', 'krovavy', 'kosti', 'kazino', 'hrom', 'pensioner', 'almaz', 'ametist', 'othody', 'biohazard', 'obsidian', 'borsch', 'unitaz',
  ]);
  assert.deepEqual([...WELCOME_FINISHES], ['akulka', 'blatkom']);
  assert.equal(SHOP_FINISHES.length, 39);
  const byGrade = (g: string) => SHOP_FINISHES.filter((f) => FINISHES[f].rarity === g).length;
  assert.deepEqual([byGrade('common'), byGrade('rare'), byGrade('epic'), byGrade('legendary')], [2, 15, 13, 9]);
  assert.deepEqual([...CASE_FINISHES], [...SHOP_FINISHES], 'the case gives only what is on sale');
  // the first line is retired, not deleted: its ids stay valid (owned rows keep working), nothing of it is sold
  for (const f of ['berezka', 'rzhavchina', 'zima', 'flora', 'gzhel', 'pioner', 'malahit', 'zoloto', 'yantar'] as const) {
    assert.ok(FINISH_IDS.includes(f) && FINISHES[f].retired, f);
    assert.equal(skinPrice(f), null, f);
  }
  assert.deepEqual(parseSkin('avtomat.gzhel'), { weapon: 'avtomat', finish: 'gzhel' });
  // the two free ones of the first line stay free for everyone (whoever wears one keeps it)
  assert.deepEqual([...FREE_FINISHES], ['berezka', 'rzhavchina']);
  const want = { common: 99, rare: 99, epic: 199, legendary: 299 } as const;
  for (const f of SHOP_FINISHES) assert.deepEqual(skinPrice(f), { currency: 'diamonds', amount: want[FINISHES[f].rarity], level: 1 }, f);
  for (const f of WELCOME_FINISHES) assert.equal(skinPrice(f), null, `${f}: a gift, not sold`);
  const inv = { skins: ['avtomat.gzhel', 'avtomat.kosmos'], diamonds: 150 };
  assert.ok(ownsSkin(inv.skins, 'avtomat', 'berezka') && ownsSkin(new Set(inv.skins), 'avtomat', 'gzhel') && !ownsSkin(inv.skins, 'pistol', 'gzhel'));
  assert.equal(skinBuyRefusal(inv, 'avtomat', 'berezka'), 'owned');
  assert.equal(skinBuyRefusal(inv, 'avtomat', 'kosmos'), 'owned');
  assert.equal(skinBuyRefusal(inv, 'pistol', 'haki'), null);
  assert.equal(skinBuyRefusal(inv, 'pistol', 'kosmos'), 'funds');
  assert.equal(skinBuyRefusal(inv, 'pistol', 'gzhel'), 'not_for_sale', 'retired');
  assert.equal(skinBuyRefusal(inv, 'pistol', 'akulka'), 'not_for_sale', 'the gift');
  // the gift's skins: every weapon in both finishes; the line's skins: every weapon in the 41
  assert.equal(welcomeSkins().length, SKINNABLE_WEAPONS.length * 2);
  assert.equal(lineSkins().length, SKINNABLE_WEAPONS.length * 41);
  // the case never gives a gift or a retired finish
  const r = () => 0.5;
  for (let i = 0; i < 50; i++) {
    const d = drawSkin(new Set(), r);
    assert.ok(d && SHOP_FINISHES.includes(d.finish));
  }
});

test('v0.2.18 BLATS: on sale, 1 BLATS = 1 cent, packs from 99, 10 for every new level, the skin case 199 (v0.2.24)', () => {
  assert.equal(REAL_MONEY, true);
  assert.equal(DIAMOND_PACKS[0]!.diamonds, 99);
  for (const p of DIAMOND_PACKS) assert.equal(p.usdCents, p.diamonds, p.id);
  assert.deepEqual([blatsToUsd(199), blatsToUsd(1099), blatsToUsd(99)], ['$1.99', '$10.99', '$0.99']);
  assert.deepEqual([blatsForLevel(1), blatsForLevel(2), blatsForLevel(57), blatsForLevel(0)], [0, BLATS_PER_LEVEL, BLATS_PER_LEVEL, 0]);
  assert.equal(BLATS_PER_LEVEL, 10);
  assert.deepEqual(SKIN_CASE_PRICE, { currency: 'diamonds', amount: 199, level: 1 });
  assert.deepEqual([SKIN_RARITY_CHANCE.common, SKIN_RARITY_CHANCE.rare, SKIN_RARITY_CHANCE.epic, SKIN_RARITY_CHANCE.legendary], [40, 30, 20, 10]);
  const inv = (diamonds: number): Inventory => ({ tokens: 0, diamonds, level: 1, weapons: [], characters: ['petya', 'valuta'], gadgets: [], mods: {}, skins: [], loadout: {} as Inventory['loadout'] });
  assert.equal(buyRefusal(inv(698), 'character', 'lev'), 'funds');
  assert.equal(buyRefusal(inv(699), 'character', 'lev'), null);
});

test('v0.2.18 part 2 character case: 199 BLATS (v0.2.24), grades 40 / 30 / 20 / 10, only the characters for BLATS, never a duplicate', () => {
  assert.deepEqual(CHARACTER_CASE_PRICE, { currency: 'diamonds', amount: 199, level: 1 });
  assert.equal(CASE_CHARACTERS.length, CHARACTER_IDS.length - 5, 'all but the two free and the three for talons');
  assert.ok(!CASE_CHARACTERS.includes('petya') && !CASE_CHARACTERS.includes('uchastkovy') && CASE_CHARACTERS.includes('kasatka'));
  const none = new Set<CharacterId>();
  assert.deepEqual(characterCaseOdds(none), { common: 40, rare: 30, epic: 20, legendary: 10 });
  // a complete grade drops out and the others share its chance
  const legendaries = CASE_CHARACTERS.filter((c) => CHARACTERS[c].grade === 'legendary');
  const o = characterCaseOdds(new Set(legendaries));
  assert.equal(o.legendary, 0);
  assert.ok(Math.abs(o.common + o.rare + o.epic - 100) < 1e-9 && Math.abs(o.common - 40 / 0.9) < 1e-9);
  // the draw: by grade, then any missing one of it; never an owned one; null when complete
  const owned = new Set<CharacterId>();
  let i = 0;
  const rand = () => ((i++ * 0.6180339887) % 1);
  for (let k = 0; k < CASE_CHARACTERS.length; k++) {
    const d = drawCharacter(owned, rand)!;
    assert.ok(d && !owned.has(d.character) && CHARACTERS[d.character].grade === d.grade);
    owned.add(d.character);
  }
  assert.equal(drawCharacter(owned, rand), null);
  assert.deepEqual(characterCaseOdds(owned), { common: 0, rare: 0, epic: 0, legendary: 0 });
});

test('invitations pay talons; codes', () => {
  assert.equal(REFERRAL_TALONS, 150);
  assert.ok(isRefCode('Ab12Cd34') && isRefCode('streamer_name') && !isRefCode('a b') && !isRefCode('x') && !isRefCode(42));
});
