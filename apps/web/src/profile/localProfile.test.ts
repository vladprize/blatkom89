import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, AVATAR_IDS, levelForXp, XP_RULES } from '@blatkom/shared';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Standing } from '@blatkom/shared';
import { createLocalProfile, localProfileView, recordLocalMatch, renameLocalProfile, sanitizeLocalProfile, setLocalAvatar, LOCAL_HISTORY_MAX } from './localProfile.js';
import { avatarName } from '../i18n/content.js';
import { _setLangForTests } from '../i18n/index.js';
import { randomNickname } from './nickname-words.js';

const st = (id: string, place: number, kills: number, assists: number, deaths: number, isBot = id !== 'local'): Standing => ({
  id,
  slot: 0,
  name: id,
  character: 'petya',
  isBot,
  kills,
  assists,
  deaths,
  score: kills * 2 + assists,
  damageDealt: 0,
  bestStreak: 0,
  place,
});

test('demo profile: nickname is validated like the server does', () => {
  assert.equal(createLocalProfile('  Тихий Завхоз ').displayName, 'Тихий Завхоз');
  assert.throws(() => createLocalProfile('x'));
  assert.throws(() => createLocalProfile('<script>'));
  assert.equal(renameLocalProfile(createLocalProfile('Петя'), 'Фартовый Енот').displayName, 'Фартовый Енот');
  for (let i = 0; i < 200; i++) assert.doesNotThrow(() => createLocalProfile(randomNickname()));
});

test('demo profile: a practice win awards XP, achievements and history exactly once', () => {
  const p0 = createLocalProfile('Тихий Завхоз');
  const match = { matchId: 'offline-a', reason: 'score' as const, durationMs: 180_000, mapId: 'factory' as const, localId: 'local', standings: [st('local', 1, 6, 2, 1), st('bot0', 2, 3, 1, 4), st('bot1', 3, 1, 0, 5)] };
  const rec = recordLocalMatch(p0, match);
  assert.ok(rec);
  const expected = XP_RULES.completion + 6 * XP_RULES.perKill + 2 * XP_RULES.perAssist + XP_RULES.placement[0]! + ACHIEVEMENTS.first_match.xpReward + ACHIEVEMENTS.first_win.xpReward + ACHIEVEMENTS.multi_kill.xpReward;
  assert.equal(rec.personal.xpGained, expected);
  assert.equal(rec.profile.xp, expected);
  assert.equal(rec.personal.level, levelForXp(expected).level);
  assert.deepEqual([...rec.personal.newAchievements].sort(), ['first_match', 'first_win', 'multi_kill']);
  assert.equal(rec.profile.wins, 1);
  assert.equal(rec.profile.assists, 2);
  assert.equal(rec.profile.currentWinStreak, 1);
  assert.equal(rec.profile.history.length, 1);
  assert.equal(rec.profile.playtimeSec, 180);
  // the same match again (results screen re-rendered) changes nothing
  assert.equal(recordLocalMatch(rec.profile, match), null);
  // a loss resets the streak
  const loss = recordLocalMatch(rec.profile, { ...match, matchId: 'offline-b', standings: [st('bot0', 1, 5, 0, 1), st('local', 2, 2, 1, 3)] });
  assert.ok(loss);
  assert.equal(loss.profile.losses, 1);
  assert.equal(loss.profile.currentWinStreak, 0);
  assert.equal(loss.profile.bestWinStreak, 1);
  assert.deepEqual(loss.personal.newAchievements, []);
});

test('demo profile: storage data is sanitised and the view matches the online shapes', () => {
  assert.equal(sanitizeLocalProfile(null), null);
  assert.equal(sanitizeLocalProfile({ displayName: '' }), null);
  const s = sanitizeLocalProfile({ displayName: 'Енот', xp: -5, kills: 'many', wins: 3.7, achievements: { first_win: '2026-10-01T10:00:00.000Z', bogus: 'x' }, history: [{ matchId: 'm', mapId: 'nowhere', character: 'petya' }, { matchId: 'm2', mapId: 'yard', character: 'valuta', kills: 2 }] });
  assert.ok(s);
  assert.equal(s.xp, 0);
  assert.equal(s.kills, 0);
  assert.equal(s.wins, 3);
  assert.deepEqual(Object.keys(s.achievements), ['first_win']);
  assert.equal(s.history.length, 1);
  let p = createLocalProfile('Сыч');
  for (let i = 0; i < LOCAL_HISTORY_MAX + 5; i++) p = recordLocalMatch(p, { matchId: `m${i}`, reason: 'time', durationMs: 1000, mapId: 'yard', localId: 'local', standings: [st('local', 1, 1, 0, 0), st('bot0', 2, 0, 0, 1)] })!.profile;
  assert.equal(p.history.length, LOCAL_HISTORY_MAX);
  const v = localProfileView(p, 'petya');
  assert.equal(v.profile.level, levelForXp(p.xp).level);
  assert.equal(v.profile.matchesPlayed, LOCAL_HISTORY_MAX + 5);
  assert.equal(v.achievements.length, Object.keys(ACHIEVEMENTS).length);
  assert.ok(v.achievements.find((a) => a.id === 'ten_matches')?.unlockedAt);
});

test('avatars: picked, kept through matches and storage, unknown ids dropped; every id has a picture and names', () => {
  let p = setLocalAvatar(createLocalProfile('Сыч'), 'militia');
  assert.equal(p.avatar, 'militia');
  p = recordLocalMatch(p, { matchId: 'a1', reason: 'time', durationMs: 1000, mapId: 'yard', localId: 'local', standings: [st('local', 1, 1, 0, 0), st('bot0', 2, 0, 0, 1)] })!.profile;
  assert.equal(p.avatar, 'militia', 'a match keeps the avatar');
  assert.equal(sanitizeLocalProfile(JSON.parse(JSON.stringify(p)))?.avatar, 'militia', 'storage round-trip');
  assert.equal(localProfileView(p, 'petya').profile.avatar, 'militia');
  assert.equal(sanitizeLocalProfile({ ...p, avatar: 'nobody' })?.avatar, undefined, 'an unknown id is dropped');
  assert.equal(setLocalAvatar(p, null).avatar, undefined, 'null removes it');
  assert.equal(localProfileView(createLocalProfile('Сыч'), 'petya').profile.avatar, null);
  assert.equal(new Set(AVATAR_IDS).size, 24);
  const names = new Set<string>();
  for (const id of AVATAR_IDS) {
    assert.match(id, /^[a-z]{2,16}$/, 'fits the database check (profiles.avatar)');
    assert.ok(existsSync(fileURLToPath(new URL(`../../public/assets/avatars/${id}.jpg`, import.meta.url))), `assets/avatars/${id}.jpg`);
    _setLangForTests('en');
    const en = avatarName(id);
    _setLangForTests('ru');
    const ru = avatarName(id);
    assert.ok(en && ru && /[а-яё]/i.test(ru), `${id}: English and Russian names`);
    names.add(en);
  }
  _setLangForTests('en');
  assert.equal(names.size, AVATAR_IDS.length, 'names are distinct');
});
