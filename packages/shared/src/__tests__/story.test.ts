import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  CHARACTER_IDS,
  GADGETS,
  MAP_IDS,
  MAX_PLAYERS,
  STORY_CAMPAIGNS,
  STORY_CARD_INDEX,
  STORY_CAST,
  STORY_CHAPTERS,
  STORY_MISSIONS,
  WEAPONS,
  campaignMissions,
  chapterMissions,
  charactersMet,
  isChapterDone,
  isMissionOpen,
  nextMission,
  parseSkin,
  storyGameMode,
} from '../index.js';
import type { StoryKit } from '../index.js';

const kitOk = (k: StoryKit) =>
  WEAPONS[k.sidearm]?.slot === 1 && WEAPONS[k.melee]?.slot === 2 && (k.primary === null || WEAPONS[k.primary]?.slot === 3) && (k.gadget === null || !!GADGETS[k.gadget]);

test('story: every mission is playable as written — map, hero, kits, sides, objective, room for everyone', () => {
  const ids = new Set<string>();
  for (const m of STORY_MISSIONS) {
    assert.ok(!ids.has(m.id), `unique id ${m.id}`);
    ids.add(m.id);
    assert.ok((MAP_IDS as readonly string[]).includes(m.map), `${m.id}: map ${m.map}`);
    assert.ok(CHARACTER_IDS.includes(m.hero), `${m.id}: hero`);
    assert.equal(m.hero, m.campaign, `${m.id}: the campaign's hero`);
    assert.ok(kitOk(m.kit), `${m.id}: the hero's kit`);
    const enemies = m.npcs.filter((n) => n.side === 'enemy');
    assert.ok(enemies.length >= 1, `${m.id}: someone to fight`);
    assert.ok(m.npcs.length + 1 <= MAX_PLAYERS, `${m.id}: fits a room`);
    assert.ok(m.npcs.filter((n) => n.boss).length <= 1, `${m.id}: one boss at most`);
    for (const n of m.npcs) {
      assert.ok(CHARACTER_IDS.includes(n.character), `${m.id}: npc ${n.character}`);
      assert.ok(kitOk(n.kit), `${m.id}: ${n.character}'s kit`);
      assert.notEqual(n.character === m.hero && n.side === 'ally', true, `${m.id}: the hero is not his own ally`);
      if (n.wave) assert.equal(m.objective.kind, 'clear', `${m.id}: waves only in clear-outs`);
    }
    if (m.objective.kind === 'clear') assert.ok(enemies.some((n) => !n.wave), `${m.id}: the first wave is there at the start`);
    if ('limit' in m.objective) assert.ok(m.objective.limit > 0, `${m.id}: a limit`);
    assert.ok(m.timeLimitMs >= 60_000 && m.timeLimitMs <= 15 * 60_000, `${m.id}: a time limit`);
    assert.ok(m.talons > 0 && m.xp > 0, `${m.id}: a reward`);
    assert.equal(storyGameMode(m.objective), m.objective.kind === 'flag' ? 'ctf' : m.objective.kind === 'bases' ? 'bases' : 'teams');
    for (const c of m.meets) assert.deepEqual(STORY_CAST[c], { campaign: m.campaign, chapter: m.chapter }, `${m.id}: ${c} is met where the cast says`);
  }
});

test('story: chapters — written ones have five missions numbered in order, the rest none; rewards exist', () => {
  for (const c of STORY_CAMPAIGNS) {
    const ms = campaignMissions(c);
    ms.forEach((m, i) => assert.equal(m.n, i + 1, `${c}: missions numbered 1..n`));
    for (const ch of STORY_CHAPTERS.filter((x) => x.campaign === c)) {
      const list = chapterMissions(c, ch.chapter);
      assert.equal(list.length, ch.ready ? 5 : 0, `${c} chapter ${ch.chapter}`);
      if (ch.ready) assert.ok(ch.achievement && ACHIEVEMENTS[ch.achievement], `${c} chapter ${ch.chapter}: an achievement`);
      for (const s of ch.skins) assert.ok(parseSkin(s), `skin ${s}`);
      for (const ch2 of ch.characters) assert.ok(CHARACTER_IDS.includes(ch2));
      assert.ok(ch.talons > 0);
    }
  }
  assert.ok(STORY_CHAPTERS.filter((x) => x.ready).length >= 2, 'chapter 1 of both campaigns');
});

test('story: the cast — all 24 placed, 11 met in each campaign, the card index holds the 22 others', () => {
  assert.deepEqual(Object.keys(STORY_CAST).sort(), [...CHARACTER_IDS].sort());
  for (const c of STORY_CAMPAIGNS) {
    const people = CHARACTER_IDS.filter((x) => STORY_CAST[x].campaign === c && x !== 'petya' && x !== 'uchastkovy');
    assert.equal(people.length, 11, `${c}: eleven of the district's people`);
  }
  assert.equal(STORY_CARD_INDEX.length, 22);
  assert.ok(!STORY_CARD_INDEX.includes('petya') && !STORY_CARD_INDEX.includes('uchastkovy'));
});

test('story: what is open — the first mission of each campaign, then one after another; chapters and the met', () => {
  const done = new Set<string>();
  assert.ok(isMissionOpen('a1', done) && isMissionOpen('b1', done));
  assert.ok(!isMissionOpen('a2', done) && !isMissionOpen('b5', done) && !isMissionOpen('zz', done));
  assert.equal(nextMission('petya', done)?.id, 'a1');
  done.add('a1');
  assert.ok(isMissionOpen('a2', done));
  assert.equal(nextMission('petya', done)?.id, 'a2');
  assert.deepEqual([...charactersMet(done)], ['vorona']);
  assert.ok(!isChapterDone('petya', 1, done));
  for (const id of ['a2', 'a3', 'a4', 'a5']) done.add(id);
  assert.ok(isChapterDone('petya', 1, done));
  assert.deepEqual([...charactersMet(done)].sort(), ['mihalych', 'uchastkovy', 'valuta', 'vorona']);
  // chapter 2 follows chapter 1 (v0.2.13); chapter 3 is not written yet
  assert.equal(nextMission('petya', done)?.id, 'a6');
  assert.ok(!isChapterDone('petya', 2, done));
  for (const id of ['a6', 'a7', 'a8', 'a9', 'a10']) done.add(id);
  assert.ok(isChapterDone('petya', 2, done));
  assert.equal(nextMission('petya', done), null, 'chapter 3 is not written yet');
  assert.ok(!isChapterDone('petya', 3, done), 'an unwritten chapter is never done');
  assert.deepEqual([...charactersMet(done)].sort(), ['mihalych', 'popugay', 'tarakan', 'uchastkovy', 'valuta', 'varan', 'vorona', 'zmeya']);
});
