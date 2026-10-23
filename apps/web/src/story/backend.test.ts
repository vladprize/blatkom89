import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS, chapterMissions } from '@blatkom/shared';
import { createLocalProfile } from '../profile/localProfile.js';
import type { LocalProfile } from '../profile/localProfile.js';
import { loadLocalDone, localBackend } from './backend.js';

const setup = (withProfile = true) => {
  const mem = new Map<string, string>();
  let profile: LocalProfile | null = withProfile ? createLocalProfile('Pilot') : null;
  const b = localBackend({ profile: () => profile, saveProfile: (p) => (profile = p), storage: { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v) }, now: () => new Date('2026-10-23T12:00:00Z') });
  return { b, mem, profile: () => profile };
};

test('offline story: missions open one after another, the first run pays its experience, a replay only the best time', async () => {
  const { b, profile } = setup();
  assert.deepEqual(await b.progress(), []);
  await assert.rejects(b.start('a2'), /mission_locked/);
  const ticket = await b.start('a1');
  const r = await b.complete(ticket, 61_000, 3, 0);
  assert.equal(r.first, true);
  assert.equal(r.xp, STORY_MISSIONS.find((m) => m.id === 'a1')!.xp);
  assert.equal(r.talons, 0, 'no talons without a server');
  assert.equal(profile()!.xp, r.xp);
  assert.equal(await b.start('a2'), 'a2', 'the next one opens');
  const again = await b.complete(await b.start('a1'), 45_000, 3, 1);
  assert.equal(again.first, false);
  assert.equal(again.xp, 0);
  assert.deepEqual((await b.progress()).map((d) => [d.id, d.bestMs, d.completions]), [['a1', 45_000, 2]]);
});

test('offline story: the chapter’s last mission brings its achievement once; no profile — progress only', async () => {
  const { b, profile } = setup();
  for (const m of chapterMissions('uchastkovy', 1)) await b.complete(await b.start(m.id), 30_000, 1, 0);
  const p = profile()!;
  assert.ok(p.achievements.story_uchastkovy_1, 'the chapter achievement is in the local profile');
  const xp = chapterMissions('uchastkovy', 1).reduce((a, m) => a + m.xp, 0);
  assert.ok(p.xp >= xp + 100, `mission and achievement experience (${p.xp})`);
  const none = setup(false);
  const r = await none.b.complete(await none.b.start('b1'), 20_000, 0, 0);
  assert.equal(r.first, true);
  assert.equal(r.xp, 0);
  assert.equal(r.achievement, null);
  assert.equal((await none.b.progress()).length, 1);
});

test('offline story: what storage gives back is cleaned', () => {
  assert.deepEqual(loadLocalDone(null), []);
  assert.deepEqual(loadLocalDone('not json'), []);
  const done = loadLocalDone(JSON.stringify({ done: [{ id: 'a1', at: 'x', bestMs: -5, completions: 0 }, { id: 'zz9', at: '2026-01-01', bestMs: 1, completions: 1 }, { id: 'a1', bestMs: 9 }, 'junk'] }));
  assert.equal(done.length, 1);
  assert.equal(done[0]!.id, 'a1');
  assert.equal(done[0]!.bestMs, 0);
  assert.equal(done[0]!.completions, 1);
});
