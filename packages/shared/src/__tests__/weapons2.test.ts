import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, input, startDuel, BTN, PISTOL_ONLY, testMap } from './helpers.js';
import { MAX_HP, MEDKIT_HEAL, RUN_SPEED, TICK_MS } from '../constants/game.js';
import { WEAPONS, WEAPON_IDS, applyMods, sanitizeMods, upgradeStatsFor, UPGRADE_EFFECT, damageFalloff, SIDEARMS, MELEE_WEAPONS, PRIMARY_WEAPONS } from '../game-rules/weapons.js';
import type { WeaponId } from '../game-rules/weapons.js';
import { DEFAULT_LOADOUT, sanitizeLoadout } from '../game-rules/loadout.js';
import type { Loadout } from '../game-rules/loadout.js';
import { encodeSnapshot, decodeSnapshot } from '../net/codec.js';
import { weaponFor } from '../sim/world.js';

const withPrimary = (primary: WeaponId | null, extra: Partial<Loadout> = {}): Loadout => ({ ...PISTOL_ONLY, primary, ...extra });

/** Hits (or blasts / swings) needed to eliminate a 100 HP target at distance d, every pellet landing. */
function hitsToKill(id: WeaponId, d = 0): number {
  const w = WEAPONS[id];
  const per = w.kind === 'projectile' ? w.damage + w.projectile!.splash : w.damage * w.pellets * (w.kind === 'hitscan' ? damageFalloff(w, d) : 1);
  return Math.ceil(MAX_HP / per - 1e-9);
}
/** Time to kill (ms) at distance d if every shot lands, including reloads. */
function timeToKill(id: WeaponId, d = 0): number {
  const w = WEAPONS[id];
  const n = hitsToKill(id, d);
  if (w.kind === 'melee' || w.magazine >= n) return (n - 1) * w.fireIntervalMs;
  const reloads = Math.floor((n - 1) / w.magazine);
  return (n - 1 - reloads) * w.fireIntervalMs + reloads * w.reloadMs;
}

test('balance: classic shooter hit counts at 100 HP', () => {
  assert.equal(hitsToKill('pistol'), 4, 'pistol: 4 body hits');
  assert.equal(hitsToKill('avtomat'), 4, 'assault rifle: 4 hits');
  assert.equal(hitsToKill('obrez'), 1, 'sawn-off: one point-blank blast');
  assert.ok(hitsToKill('obrez', 200) >= 2, 'sawn-off is weak at range');
  assert.equal(hitsToKill('montirovka'), 2);
  assert.equal(hitsToKill('svd'), 2);
  assert.equal(hitsToKill('mosinka'), 2);
  for (const id of ['uzi', 'ksyuha', 'pkm', 'tommy', 'gvozdomet', 'stechkin'] as const) assert.ok(hitsToKill(id) >= 4 && hitsToKill(id) <= 8, `${id} trades damage for rate`);
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    assert.ok(w.damage > 0 && w.fireIntervalMs >= 50, `${id} sane`);
    assert.ok(hitsToKill(id) >= 1 && hitsToKill(id) <= 8, `${id}: 1–8 hits`);
    if (w.kind !== 'melee') assert.ok(w.magazine >= 1 && w.reloadMs > 0, `${id} magazine/reload`);
    assert.ok(w.moveSpeed > 0.75 && w.moveSpeed <= 1.05, `${id} move speed`);
  }
  // single-shot kills only from shotguns point-blank, launchers (splash) and the slow sledgehammer
  const oneShot = WEAPON_IDS.filter((id) => hitsToKill(id) === 1).sort();
  assert.deepEqual(oneShot, ['granatomet', 'kuvalda', 'muha', 'obrez', 'rpg', 'toz'].sort().filter((id) => hitsToKill(id as WeaponId) === 1));
  for (const id of oneShot) assert.ok(['shotgun', 'obrez', 'rocket', 'heavySwing'].includes(WEAPONS[id].sound), `${id} is a shotgun, launcher or sledgehammer`);
});

test('balance: paid and rare weapons are sidegrades, not upgrades', () => {
  // the free assault rifle sets the bar for primaries; nothing kills faster at mid range
  const bar = timeToKill('avtomat', 250);
  for (const id of PRIMARY_WEAPONS) {
    if (WEAPONS[id].tier === 'base' || WEAPONS[id].pellets > 1 || WEAPONS[id].kind === 'projectile') continue;
    assert.ok(timeToKill(id, 250) >= bar - 1e-6, `${id}: TTK ${timeToKill(id, 250)} ms at 250 px vs avtomat ${bar} ms`);
  }
  // sidearms: anything that out-damages the free pistol pays with recoil, range or reload
  for (const id of SIDEARMS) {
    const w = WEAPONS[id];
    if (id === 'pistol') continue;
    assert.ok(timeToKill(id, 0) >= 450, `${id} close-range TTK ${timeToKill(id, 0)}`);
    assert.ok(w.spread >= WEAPONS.pistol.spread * 0.6 || w.fireIntervalMs >= WEAPONS.pistol.fireIntervalMs, `${id} pays for it`);
  }
  // melee: nothing beats the free crowbar's two-hit rhythm without a drawback
  for (const id of MELEE_WEAPONS) {
    if (id === 'montirovka') continue;
    const faster = timeToKill(id) < timeToKill('montirovka');
    assert.ok(!faster || WEAPONS[id].meleeRange < WEAPONS.montirovka.meleeRange, `${id} faster only with less reach`);
  }
});

test('loadout: sanitize rejects unknown, mis-slotted and unowned weapons', () => {
  assert.deepEqual(sanitizeLoadout(null), { ...DEFAULT_LOADOUT, mods: {} });
  const l = sanitizeLoadout({ sidearm: 'finka', melee: 'pb', primary: 'laser', mods: { svd: { dmg: 9, mag: -1, x: 2 }, nope: { dmg: 1 } } });
  assert.equal(l.sidearm, 'pistol');
  assert.equal(l.melee, 'montirovka');
  assert.equal(l.primary, 'avtomat');
  assert.deepEqual(l.mods, { svd: { dmg: 3 } });
  const owned = new Set<WeaponId>(['pistol', 'montirovka', 'avtomat', 'obrez', 'svd']);
  const l2 = sanitizeLoadout({ sidearm: 'nagan', melee: 'bita', primary: 'svd', mods: { nagan: { dmg: 2 }, svd: { rate: 1 } } }, (w) => owned.has(w));
  assert.equal(l2.sidearm, 'pistol');
  assert.equal(l2.melee, 'montirovka');
  assert.equal(l2.primary, 'svd');
  assert.deepEqual(l2.mods, { svd: { rate: 1 } });
  assert.equal(sanitizeLoadout({ primary: null }).primary, null);
});

test('upgrades: capped per-level effects, only stats that fit the weapon', () => {
  const ak = WEAPONS.avtomat;
  const up = applyMods(ak, { dmg: 3, rate: 3, reload: 3, mag: 3 });
  assert.ok(Math.abs(up.damage - ak.damage * (1 + UPGRADE_EFFECT.dmg[3]!)) < 1e-9);
  assert.equal(up.fireIntervalMs, Math.round(ak.fireIntervalMs * (1 - UPGRADE_EFFECT.rate[3]!)));
  assert.equal(up.reloadMs, Math.round(ak.reloadMs * (1 - UPGRADE_EFFECT.reload[3]!)));
  assert.equal(up.magazine, 30 + 9);
  assert.equal(applyMods(ak, { dmg: 99 }).damage, applyMods(ak, { dmg: 3 }).damage, 'levels are capped');
  assert.equal(applyMods(ak, {}), ak, 'no mods returns the base definition');
  // melee upgrades only damage and swing speed; single-shot weapons never get a magazine upgrade
  assert.deepEqual(upgradeStatsFor(WEAPONS.bita), ['dmg', 'rate']);
  assert.equal(applyMods(WEAPONS.rpg, { mag: 3 }).magazine, 1);
  assert.equal(applyMods(WEAPONS.rpg, { dmg: 3 }).projectile!.splash, WEAPONS.rpg.projectile!.splash * 1.12);
  assert.deepEqual(sanitizeMods({ dmg: 2.7, rate: '3', reload: -4, mag: Infinity }), { dmg: 2 });
  // a fully upgraded free rifle still kills in the same number of hits as a fresh one
  assert.equal(Math.ceil(MAX_HP / up.damage), 4);
});

test('upgrades: the world applies a player\'s mods to fire rate and magazine', () => {
  const w = makeWorld();
  const mods = { avtomat: { rate: 3, mag: 3 } };
  const { p1 } = startDuel(w, { x: 60, y: 50 }, { x: 350, y: 260 }, [withPrimary('avtomat', { mods }), PISTOL_ONLY]);
  w.players.get('a')!.alive && w.spawnPlayer(p1, false);
  p1.x = 60;
  p1.y = 50;
  assert.equal(p1.weapon, 'avtomat');
  assert.equal(p1.heavyMag, 39, 'upgraded magazine at spawn');
  assert.equal(weaponFor(p1, 'avtomat').fireIntervalMs, 88);
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    w.applyInput('a', input({ buttons: BTN.FIRE, aimRad: 0 }));
    shots += w.drainEvents().filter((e) => e.t === 'shot').length;
  }
  assert.equal(shots, 12, '1 s of fire at 88 ms intervals');
});

test('loadout: spawn with the primary in hand (full magazine + one spare), slots 1–3 switch', () => {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, { x: 60, y: 50 }, { x: 350, y: 260 }, [withPrimary('svd', { sidearm: 'nagan', melee: 'bita' }), PISTOL_ONLY]);
  w.spawnPlayer(p1, false);
  assert.equal(p1.weapon, 'svd');
  assert.equal(p1.heavy, 'svd');
  assert.equal(p1.heavyMag, WEAPONS.svd.magazine);
  assert.equal(p1.heavyReserve, WEAPONS.svd.magazine);
  assert.equal(p1.sideMag, WEAPONS.nagan.magazine);
  assert.equal(p2.weapon, 'pistol');
  assert.equal(p2.heavy, null);
  for (let i = 0; i < 12; i++) w.applyInput('a', input({ slot: 1 }));
  assert.equal(p1.weapon, 'nagan');
  w.applyInput('a', input({ slot: 2 }));
  assert.equal(p1.weapon, 'bita');
  w.applyInput('a', input({ slot: 3 }));
  assert.equal(p1.weapon, 'svd');
  // a loadout change applies from the next spawn, not mid-life
  w.setLoadout('a', withPrimary('pkm'));
  assert.equal(p1.weapon, 'svd');
  w.spawnPlayer(p1, false);
  assert.equal(p1.weapon, 'pkm');
  assert.equal(p1.sidearm, 'pistol');
});

test('weapons: heavy weapons slow the carrier down', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 40, y: 50 }, { x: 350, y: 260 }, [withPrimary('pkm'), PISTOL_ONLY]);
  w.spawnPlayer(p1, false);
  p1.x = 40;
  p1.y = 50;
  for (let i = 0; i < 40; i++) w.applyInput('a', input({ moveX: 127 }));
  assert.ok(Math.abs(p1.vx - RUN_SPEED * WEAPONS.pkm.moveSpeed) < 1e-6, `vx ${p1.vx}`);
  for (let i = 0; i < 2; i++) w.applyInput('a', input({ moveX: 127, slot: 1 }));
  for (let i = 0; i < 40; i++) w.applyInput('a', input({ moveX: 127 }));
  assert.ok(Math.abs(p1.vx - RUN_SPEED) < 1e-6, 'full speed with the pistol out');
});

test('weapons: silenced weapons are flagged (hidden from the minimap radar)', () => {
  const silenced = WEAPON_IDS.filter((id) => WEAPONS[id].silenced).sort();
  assert.deepEqual(silenced, ['arbalet', 'pb', 'val']);
  for (const id of silenced) assert.notEqual(WEAPONS[id].sound, 'avtomat');
});

/** Fires one rocket from p1 (aim 0) and steps the world until it explodes. */
function fireRocket(w: ReturnType<typeof makeWorld>, aimRad = 0) {
  w.applyInput('a', input({ buttons: BTN.FIRE, aimRad }));
  const launched = w.drainEvents().filter((e) => e.t === 'rocket');
  assert.equal(launched.length, 1, 'rocket launched');
  assert.equal(w.projectiles.length, 1);
  const events = [];
  for (let i = 0; i < 200 && w.projectiles.length > 0; i++) {
    w.update();
    events.push(...w.drainEvents());
  }
  assert.equal(w.projectiles.length, 0, 'rocket exploded');
  return events;
}

test('rockets: direct hit = direct + splash damage; explosion is server-side', () => {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, { x: 40, y: 50 }, { x: 160, y: 50 }, [withPrimary('rpg'), PISTOL_ONLY]);
  w.spawnPlayer(p1, false);
  Object.assign(p1, { x: 40, y: 50, invulnUntil: 0 });
  Object.assign(p2, { x: 160, y: 50, hp: MAX_HP });
  assert.equal(p1.weapon, 'rpg');
  const events = fireRocket(w);
  const boom = events.find((e) => e.t === 'boom');
  assert.ok(boom && boom.t === 'boom');
  assert.equal(p2.alive, false, 'direct hit (30 + 110 splash) is lethal');
  assert.equal(p1.kills, 1);
  assert.equal(p1.hp, MAX_HP, 'shooter far from the blast is unhurt');
  assert.equal(p1.heavyMag, 0);
  assert.equal(p1.reloadWeapon, 'rpg', 'auto-reload after the only rocket');
});

test('rockets: splash hits around corners only with line of sight; self-damage is halved', () => {
  const w = makeWorld();
  // wall block occupies x 190..210, y 100..200; p2 hides behind it, p3 stands near the impact point
  const { p1, p2 } = startDuel(w, { x: 120, y: 150 }, { x: 240, y: 150 }, [withPrimary('rpg'), PISTOL_ONLY]);
  const p3 = w.addPlayer('c', 'Сыч', 'mihalych', false, PISTOL_ONLY);
  w.spawnPlayer(p1, false);
  Object.assign(p1, { x: 120, y: 150, invulnUntil: 0 });
  Object.assign(p2, { x: 240, y: 150, hp: MAX_HP, invulnUntil: 0 });
  Object.assign(p3, { x: 170, y: 120, hp: MAX_HP, invulnUntil: 0 });
  w.drainEvents();
  fireRocket(w);
  assert.equal(p2.hp, MAX_HP, 'the wall shields the player behind it');
  assert.ok(p3.hp < MAX_HP, 'a player in the open near the impact takes splash');
  assert.ok(p1.hp === MAX_HP || p1.hp > MAX_HP - WEAPONS.rpg.projectile!.splash * 0.5 - 1, 'self-damage at most half');

  // point-blank at the wall: the shooter takes reduced damage and gets no kill credit for themselves
  const w2 = makeWorld();
  const d = startDuel(w2, { x: 176, y: 150 }, { x: 350, y: 260 }, [withPrimary('rpg'), PISTOL_ONLY]);
  w2.spawnPlayer(d.p1, false);
  Object.assign(d.p1, { x: 176, y: 150, invulnUntil: 0, hp: MAX_HP });
  w2.drainEvents();
  fireRocket(w2);
  const taken = MAX_HP - d.p1.hp;
  assert.ok(taken > 0 && taken <= Math.ceil(WEAPONS.rpg.projectile!.splash * WEAPONS.rpg.projectile!.selfFactor), `self-damage ${taken}`);
  assert.equal(d.p1.kills, 0);
  assert.equal(d.p1.damageDealt, 0, 'self-damage is not counted as damage dealt');
});

test('medkits: heal 50 up to full, are not wasted at full HP, respawn after a delay', () => {
  const w = makeWorld();
  const { p1 } = startDuel(w, { x: 300, y: 260 }, { x: 60, y: 50 });
  const kit = w.pickups.find((pk) => pk.kind === 'medkit')!;
  assert.ok(kit && kit.active && kit.weapon === null);
  assert.equal(kit.x, p1.x);
  // full HP: standing on it does nothing
  w.applyInput('a', input({}));
  assert.equal(kit.active, true);
  // hurt: heals MEDKIT_HEAL capped at MAX_HP
  p1.hp = 30;
  w.applyInput('a', input({}));
  assert.equal(p1.hp, 30 + MEDKIT_HEAL);
  assert.equal(kit.active, false);
  const ev = w.drainEvents().find((e) => e.t === 'heal');
  assert.ok(ev && ev.t === 'heal' && ev.amount === MEDKIT_HEAL);
  p1.hp = 90;
  const respawnTicks = Math.ceil(w.map.medkits[0]!.respawnMs / TICK_MS) + 1;
  for (let i = 0; i < respawnTicks; i++) w.update();
  assert.equal(kit.active, true, 'respawned');
  w.applyInput('a', input({}));
  assert.equal(p1.hp, MAX_HP, 'capped at full');
});

test('codec v3: loadout slots, heavy weapon and medkits survive a snapshot round-trip', () => {
  const w = makeWorld();
  const { p1, p2 } = startDuel(w, { x: 60, y: 50 }, { x: 160, y: 50 }, [withPrimary('rpg', { sidearm: 'stechkin', melee: 'kuvalda' }), PISTOL_ONLY]);
  w.spawnPlayer(p1, false);
  const buf = encodeSnapshot({ tick: w.tick, time: w.time, phase: w.phase, phaseRemaining: 0, players: w.players.values(), pickups: w.pickups, events: [], now: w.time });
  const s = decodeSnapshot(buf);
  const a = s.players.find((p) => p.slot === p1.slot)!;
  const b = s.players.find((p) => p.slot === p2.slot)!;
  assert.equal(a.weapon, 'rpg');
  assert.equal(a.heavy, 'rpg');
  assert.equal(a.sidearm, 'stechkin');
  assert.equal(a.melee, 'kuvalda');
  assert.equal(a.sideMag, WEAPONS.stechkin.magazine);
  assert.equal(b.heavy, null);
  assert.equal(b.sidearm, 'pistol');
  const kits = s.pickups.filter((pk) => pk.medkit);
  assert.equal(kits.length, testMap().medkits.length);
  assert.equal(kits[0]!.weapon, null);
  const guns = s.pickups.filter((pk) => !pk.medkit);
  assert.deepEqual(guns.map((g) => g.weapon), ['avtomat']);
});
