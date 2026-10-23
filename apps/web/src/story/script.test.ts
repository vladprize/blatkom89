import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_IDS, STORY_MISSIONS, STORY_ROLES } from '@blatkom/shared';
import { CAMPAIGNS, CAMPAIGN_OPENING, CHAPTER_TITLES, FAIL_LINES, MISSION_SCRIPTS, PEOPLE_2089, PROLOGUE, ROLE_NAMES } from './script.js';
import type { Beat, Line } from './script.js';

const lines = (beats: readonly Beat[]) => beats.map((b) => b.say);
const all = (): Array<{ where: string; l: Line; beat?: Beat }> => {
  const out: Array<{ where: string; l: Line; beat?: Beat }> = [];
  PROLOGUE.forEach((b, i) => out.push({ where: `prologue ${i}`, l: b.say, beat: b }));
  for (const [c, bs] of Object.entries(CAMPAIGN_OPENING)) bs.forEach((b, i) => out.push({ where: `${c} opening ${i}`, l: b.say, beat: b }));
  for (const [id, s] of Object.entries(MISSION_SCRIPTS)) {
    out.push({ where: `${id} title`, l: s.title }, { where: `${id} goal`, l: s.goal });
    s.intro.forEach((b, i) => out.push({ where: `${id} intro ${i}`, l: b.say, beat: b }));
    s.outro.forEach((b, i) => out.push({ where: `${id} outro ${i}`, l: b.say, beat: b }));
    for (const [k, b] of Object.entries(s.barks)) out.push({ where: `${id} bark ${k}`, l: b!.say, beat: b! });
  }
  for (const [k, l] of Object.entries(FAIL_LINES)) out.push({ where: `fail ${k}`, l });
  for (const [k, l] of Object.entries(ROLE_NAMES)) out.push({ where: `role ${k}`, l });
  for (const [k, c] of Object.entries(CAMPAIGNS)) out.push({ where: `campaign ${k}`, l: c.title }, { where: `campaign ${k} tagline`, l: c.tagline });
  for (const [k, ls] of Object.entries(CHAPTER_TITLES)) ls.forEach((l, i) => out.push({ where: `${k} chapter ${i + 1}`, l }));
  for (const [k, p] of Object.entries(PEOPLE_2089)) out.push({ where: `2089 ${k}`, l: p.name });
  return out;
};

test('every mission has its words: a title, an objective line with the right placeholders, an intro and an outro', () => {
  for (const m of STORY_MISSIONS) {
    const s = MISSION_SCRIPTS[m.id];
    assert.ok(s, `${m.id} has a script`);
    assert.ok(s.intro.length > 0 && s.outro.length > 0, `${m.id}: comic before and after`);
    assert.ok(s.barks.start && s.barks.win, `${m.id}: lines at the start and at the win`);
    const counted = m.objective.kind === 'clear' || m.objective.kind === 'survive';
    for (const g of s.goal) {
      if (counted) assert.ok(g.includes('{left}') && !g.includes('{score}'), `${m.id} goal «${g}» counts who is left`);
      else assert.ok(g.includes('{score}') && g.includes('{limit}'), `${m.id} goal «${g}» counts the points`);
    }
    if (m.waveGapMs !== undefined || m.npcs.some((n) => (n.wave ?? 0) > 0)) assert.ok(s.barks.wave, `${m.id}: a line when the next wave comes`);
  }
  assert.deepEqual(Object.keys(MISSION_SCRIPTS).sort(), STORY_MISSIONS.map((m) => m.id).sort(), 'no script without a mission');
});

test('every line is there in both languages, fits a bubble, and is said by someone who exists', () => {
  const speakers = new Set<string>([...CHARACTER_IDS, 'caption', ...Object.keys(PEOPLE_2089)]);
  for (const { where, l, beat } of all()) {
    assert.equal(l.length, 2, where);
    for (const s of l) {
      assert.ok(s.trim().length > 0, `${where}: empty`);
      assert.ok(s.length <= 240, `${where}: ${s.length} characters is too long for a bubble`);
      assert.equal(s, s.trim(), `${where}: spaces at the ends`);
    }
    assert.ok(/[а-яё]/i.test(l[1]) || /^[\d\s.,:—–«»“”!?№-]+$/.test(l[1]), `${where}: the Russian line is in Russian («${l[1]}»)`);
    if (beat) assert.ok(speakers.has(beat.who), `${where}: unknown speaker ${beat.who}`);
  }
  for (const r of STORY_ROLES) assert.ok(ROLE_NAMES[r], `role ${r} has a name`);
});

test('the words keep to the game’s tone: no prison nicknames for the heroes', () => {
  for (const { where, l } of all()) assert.ok(!/петух/i.test(l[1]), `${where}: «${l[1]}»`);
  assert.ok(lines(PROLOGUE).length >= 6, 'the prologue tells the frame');
});
