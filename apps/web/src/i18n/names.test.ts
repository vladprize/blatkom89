/**
 * v0.2.18 part 3 (docs/ASSETS.md §4): the names players read carry no gun maker's mark — the owner's
 * decision to rename the weapons. Only the texts changed: the ids stay, saves and purchases refer to them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, WEAPONS, WEAPON_IDS } from '@blatkom/shared';
import type { CharacterId } from '@blatkom/shared';
import { RU_CHARACTERS, RU_WEAPONS } from './ru-content.js';
import { WEAPON_NAMES } from '../admin/format.js';

const MARKS =
  /AK-?47|АК-?47|Kalash|Калаш|\bUzi\b|\bУзи\b|MP5|G36|AWM|Deagle|Дигл|Desert Eagle|Tommy|Томми|Thompson|Томпсон|Mauser|Маузер|Dragunov|Драгунов|Beretta|Беретт|Glock|Глок|Saiga|Сайга/i;

test('the weapons players and the dashboard read carry no gun maker’s mark (EN and RU)', () => {
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    assert.doesNotMatch(`${w.name} · ${w.blurb}`, MARKS, `EN ${id}`);
    const r = RU_WEAPONS[id];
    assert.ok(r, `RU text for ${id}`);
    assert.doesNotMatch(`${r.name} · ${r.blurb}`, MARKS, `RU ${id}`);
    if (WEAPON_NAMES[id]) assert.doesNotMatch(WEAPON_NAMES[id]!, MARKS, `admin ${id}`);
  }
  // the renamed ones keep their ids
  assert.equal(WEAPONS.avtomat.name, 'Druzhba Rifle');
  assert.equal(RU_WEAPONS.avtomat.name, 'Автомат «Дружба»');
  assert.equal(WEAPONS.uzi.name, 'Rattler');
  assert.equal(RU_WEAPONS.zolotoy.name, 'Золотая «Дружба»');
});

test('the characters’ «weapons» notes and lore name no gun maker either', () => {
  for (const id of Object.keys(CHARACTERS) as CharacterId[]) {
    const c = CHARACTERS[id];
    assert.doesNotMatch(`${c.weaponsNote} · ${c.lore}`, MARKS, `EN ${id}`);
    const r = RU_CHARACTERS[id];
    if (r) assert.doesNotMatch(`${r.weaponsNote} · ${r.lore}`, MARKS, `RU ${id}`);
  }
});
