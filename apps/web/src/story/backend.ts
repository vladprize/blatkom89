/**
 * Where the story's progress lives. Online: the server (a signed ticket per mission, the rewards paid
 * there — api/story.ts). Offline (the single-file build that plays without a server, e.g. on a plane):
 * this browser's storage — the missions done and their best times; the experience and the chapters'
 * achievements go to the local profile; there are no talons, characters or skins without a server.
 */
import { STORY_MIN_MS, isChapterDone, isMissionOpen, levelForXp, storyChapter, storyMission } from '@blatkom/shared';
import type { StoryDone, StoryReward } from '@blatkom/shared';
import type { OnlineClient } from '../net/OnlineClient.js';
import { storageGet, storageSet } from '../app/settings.js';
import { recordLocalStory } from '../profile/localProfile.js';
import type { LocalProfile } from '../profile/localProfile.js';

export interface StoryBackend {
  /** Progress kept on this device: rewards are experience and achievements only. */
  readonly local: boolean;
  /** The shortest time between a mission's start and its report (the server refuses sooner ones). */
  readonly minMs: number;
  progress(): Promise<StoryDone[]>;
  /** A ticket for one run of the mission. */
  start(mission: string): Promise<string>;
  complete(ticket: string, ms: number, kills: number, deaths: number): Promise<StoryReward>;
}

export function onlineBackend(online: OnlineClient): StoryBackend {
  return {
    local: false,
    minMs: STORY_MIN_MS,
    progress: async () => (await online.api.story()).done,
    start: async (mission) => (await online.api.storyStart(mission)).ticket,
    complete: (ticket, ms, kills, deaths) => online.api.storyComplete(ticket, ms, kills, deaths),
  };
}

const LOCAL_KEY = 'blatkom89.story.local.v1';
const MISSION_ID = /^[a-z0-9_]{1,16}$/;

/** What this browser has done, cleaned (storage may be edited by hand or written by an older build). */
export function loadLocalDone(raw: string | null): StoryDone[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { done?: unknown };
    if (!v || !Array.isArray(v.done)) return [];
    const out: StoryDone[] = [];
    for (const d of v.done.slice(0, 200)) {
      if (!d || typeof d !== 'object') continue;
      const r = d as Record<string, unknown>;
      if (typeof r.id !== 'string' || !MISSION_ID.test(r.id) || !storyMission(r.id) || out.some((x) => x.id === r.id)) continue;
      const at = typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date(0).toISOString();
      const bestMs = typeof r.bestMs === 'number' && Number.isFinite(r.bestMs) ? Math.max(0, Math.min(Math.round(r.bestMs), 3 * 3600_000)) : 0;
      const completions = typeof r.completions === 'number' && Number.isFinite(r.completions) ? Math.max(1, Math.min(Math.floor(r.completions), 1e6)) : 1;
      out.push({ id: r.id, at, bestMs, completions });
    }
    return out;
  } catch {
    return [];
  }
}

export function localBackend(o: { profile: () => LocalProfile | null; saveProfile: (p: LocalProfile) => void; now?: () => Date; storage?: { get: (k: string) => string | null; set: (k: string, v: string) => void } }): StoryBackend {
  const now = o.now ?? (() => new Date());
  const store = o.storage ?? { get: storageGet, set: storageSet };
  const loadDone = () => loadLocalDone(store.get(LOCAL_KEY));
  return {
    local: true,
    minMs: 0,
    progress: async () => loadDone(),
    start: async (mission) => {
      const ids = new Set(loadDone().map((d) => d.id));
      if (!storyMission(mission) || !isMissionOpen(mission, ids)) throw new Error('mission_locked');
      return mission;
    },
    complete: async (ticket, ms) => {
      const m = storyMission(ticket);
      if (!m) throw new Error('no such mission');
      const done = loadDone();
      const at = now().toISOString();
      const prev = done.find((d) => d.id === m.id);
      const first = !prev;
      if (prev) {
        prev.bestMs = Math.min(prev.bestMs, Math.round(ms));
        prev.completions++;
      } else done.push({ id: m.id, at, bestMs: Math.round(ms), completions: 1 });
      store.set(LOCAL_KEY, JSON.stringify({ v: 1, done }));
      const p = o.profile();
      const reward: StoryReward = { mission: m.id, first, talons: 0, xp: 0, blatGained: 0, achievement: null, characters: [], skins: [], compensated: [], tokens: 0, xpTotal: p?.xp ?? 0, level: levelForXp(p?.xp ?? 0).level, done };
      if (first) {
        const ch = storyChapter(m.campaign, m.chapter);
        const chapterDone = !!ch?.achievement && isChapterDone(m.campaign, m.chapter, new Set(done.map((d) => d.id)));
        if (p) {
          const r = recordLocalStory(p, m.xp, chapterDone ? ch!.achievement : null, now());
          o.saveProfile(r.profile);
          reward.xp = r.xp;
          reward.achievement = r.achievement;
          reward.xpTotal = r.profile.xp;
          reward.level = levelForXp(r.profile.xp).level;
        }
      }
      return reward;
    },
  };
}
