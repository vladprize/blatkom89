/**
 * House players (v0.2.20, the owner: «Добавить в списки игроков пару сотен фейк аккаунтов с натуральными
 * никами Английскими буквами и цифрами»): accounts the game keeps itself so the player tables are never
 * empty — like the house clubs of v0.3 (clubs/house.ts).
 *
 * - Who: HOUSE_PLAYERS of them (240 by default), rows of `users` with `house_player` set (migration 028).
 *   Nobody can sign in to one: no Telegram, no device key, no email, no provider.
 * - Names: what people type — small Latin letters and digits («dima07», «silentfox», «kate1999»), one word
 *   (the alias rule of v0.2.19), the same list every time; a name a player already holds is skipped.
 * - Numbers: each has a skill and an appetite for the game that follow from its name's seed; a history to
 *   match (matches, wins, eliminations, level, rating), and every hour some of them play a few matches more
 *   (`driftHousePlayers`), so the tables move even on a host that sleeps.
 * - Never counted: the admin's metrics, player table and exports, the tournament (they play no Kon), rewards,
 *   invitations. A friend request to one stays unanswered.
 */
import { AVATAR_IDS, CHARACTER_IDS, RATING_RULES, XP_RULES, hash32, isNick, levelForXp, mulberry32, nameKey } from '@blatkom/shared';
import type { Sql } from '../database/db.js';

const DAY = 86_400_000;
/** One drift step an hour. */
export const HOUSE_STEP_MS = 3_600_000;
const DRIFT_KEY = 'house_players.drift_at';

// ── names ──────────────────────────────────────────────────────────────────────────────────────────────
const FIRST = [
  'alex', 'sasha', 'dima', 'dimon', 'maks', 'max', 'nikita', 'artem', 'kirill', 'ivan', 'vanya', 'egor', 'vlad', 'denis', 'roma', 'misha', 'oleg',
  'ilya', 'andrey', 'serega', 'pasha', 'anton', 'gleb', 'timur', 'ruslan', 'danya', 'kostya', 'vova', 'vitya', 'zhenya', 'stas', 'yura', 'lyosha',
  'kolya', 'fedya', 'sanya', 'tolik', 'slava', 'igor', 'lev', 'mark', 'matvey', 'yarik', 'vadim', 'seva', 'john', 'mike', 'jake', 'ryan', 'kevin',
  'tom', 'chris', 'leo', 'lucas', 'noah', 'ethan', 'sam', 'dan', 'nick', 'ben', 'matt', 'tyler', 'zack', 'josh', 'kyle', 'adam', 'eric', 'sean',
  'liam', 'oscar', 'finn', 'jack', 'luke', 'owen', 'dylan', 'cole', 'evan', 'ian', 'jay', 'kai', 'rex', 'ray', 'tony', 'eddie', 'frank', 'paul',
  'kate', 'anna', 'masha', 'dasha', 'nastya', 'lena', 'olya', 'katya', 'sonya', 'alina', 'vika', 'lisa', 'julia', 'emma', 'mia', 'zoe', 'nina',
  'vera', 'yana', 'polina', 'sara', 'eva', 'ira',
];
const HANDLE = [
  'wolf', 'shadow', 'ghost', 'viper', 'hawk', 'fox', 'bear', 'tiger', 'sniper', 'hunter', 'frost', 'storm', 'blaze', 'rocket', 'pixel', 'turbo',
  'nitro', 'cobra', 'raven', 'lynx', 'panther', 'rebel', 'ace', 'joker', 'phantom', 'drift', 'racer', 'boxer', 'chief', 'major', 'sarge', 'rookie',
  'legend', 'boss', 'king', 'duke', 'baron', 'spark', 'flash', 'bullet', 'trigger', 'recoil', 'falcon', 'badger', 'beaver', 'owl', 'hedgehog',
  'cat', 'crow', 'shark', 'moose', 'bison', 'otter', 'ferret', 'jackal', 'coyote', 'bandit', 'outlaw', 'ranger', 'scout', 'nomad', 'pilot',
  'captain', 'volk', 'medved', 'kot', 'lis', 'yozh', 'sokol', 'voron', 'bars', 'zver', 'batya', 'sosed', 'prapor', 'kapitan', 'mechanic',
  'gopher', 'walrus', 'goose', 'sparrow', 'comet', 'meteor', 'cyclone', 'tank', 'diesel', 'piston', 'gear', 'bolt', 'wrench', 'cassette', 'vhs',
];
const ADJ = [
  'dark', 'mad', 'big', 'lil', 'crazy', 'silent', 'fast', 'lucky', 'cool', 'real', 'true', 'old', 'young', 'iron', 'black', 'red', 'gold',
  'grey', 'night', 'wild', 'angry', 'lazy', 'sleepy', 'sneaky', 'tiny', 'mega', 'hyper', 'super', 'frozen', 'toxic', 'rusty', 'dusty', 'salty',
  'quiet', 'loud', 'sly', 'brave', 'grim', 'swift',
];
const TAIL = ['pro', 'tv', 'gg', 'play', 'xd', 'top', 'go', 'yt'];
const CITY = ['msk', 'spb', 'nsk', 'ekb', 'kzn', 'nn', 'krd', 'ufa'];
/** Numbers nobody should wear (hate codes, drug memes, a tragedy). */
const BANNED_NUMBERS: ReadonlySet<string> = new Set(['88', '14', '1488', '228', '666', '69', '420', '1312', '911', '18']);

function digits(r: () => number): string {
  const k = r();
  if (k < 0.45) return String(Math.floor(r() * 99) + 1).padStart(2, '0');
  if (k < 0.8) return String(1985 + Math.floor(r() * 28));
  return ['7', '77', '777', '123', '321', '404', '999', '111', '007', '2k', '01', '13', '42'][Math.floor(r() * 13)]!;
}
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
const leet = (s: string): string => s.replace(/[eaoi]/, (c) => ({ e: '3', a: '4', o: '0', i: '1' })[c] ?? c);

/** The `i`-th house name: what a player would type, one word of small Latin letters and digits. */
export function houseName(i: number): string {
  const r = mulberry32(hash32(0x484f5553, i));
  for (let attempt = 0; attempt < 8; attempt++) {
    const k = r();
    const n = k < 0.24 ? `${pick(r, FIRST)}${r() < 0.3 ? '_' : ''}${digits(r)}`
      : k < 0.36 ? `${pick(r, FIRST)}${String(1990 + Math.floor(r() * 22))}`
      : k < 0.42 ? `${pick(r, FIRST)}_${pick(r, HANDLE)}`
      : k < 0.54 ? `${pick(r, ADJ)}${r() < 0.25 ? '_' : ''}${pick(r, HANDLE)}`
      : k < 0.62 ? `${pick(r, ADJ)}${pick(r, HANDLE)}${digits(r)}`
      : k < 0.74 ? `${pick(r, HANDLE)}${r() < 0.2 ? '_' : ''}${digits(r)}`
      : k < 0.79 ? `${pick(r, FIRST)}${'abcdefgklmnprstvz'[Math.floor(r() * 17)]}`
      : k < 0.84 ? `${pick(r, FIRST)}${pick(r, HANDLE)}`
      : k < 0.88 ? `${r() < 0.5 ? 'the' : 'mr'}${pick(r, HANDLE)}`
      : k < 0.94 ? `${pick(r, FIRST)}${r() < 0.3 ? '_' : ''}${pick(r, TAIL)}`
      : k < 0.97 ? `${pick(r, HANDLE)}_${pick(r, CITY)}`
      : `${leet(pick(r, HANDLE))}${r() < 0.5 ? digits(r) : ''}`;
    const num = /\d+$/.exec(n)?.[0];
    if (num && BANNED_NUMBERS.has(num)) continue;
    if (isNick(n)) return n;
  }
  return `player${1000 + i}`;
}

// ── who they are ───────────────────────────────────────────────────────────────────────────────────────
export interface HousePersona {
  name: string;
  /** 0 (weak) … 1 (strong). */
  skill: number;
  /** Matches a day on average. */
  perDay: number;
  /** How long ago the account was made, days. */
  ageDays: number;
  avatar: string | null;
  character: string;
}

/** A house player's seed, from its alias (the same alias, the same player, whatever its database id). */
export const houseSeedOf = (name: string): number => {
  let h = 0x811c9dc5;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

export function persona(name: string): HousePersona {
  const r = mulberry32(houseSeedOf(name));
  const skill = Math.min(1, Math.max(0, (r() + r() + r()) / 3 + (r() - 0.5) * 0.25));
  // most play a little, a few a lot
  const perDay = 0.4 + 9 * r() ** 2.2;
  const ageDays = 3 + Math.floor(r() ** 0.8 * 72);
  const avatar = r() < 0.55 ? pick(r, AVATAR_IDS) : null;
  // the free characters most often, then the ones for level and talons, sometimes a bought one
  const c = r();
  const character = c < 0.5 ? pick(r, CHARACTER_IDS.slice(0, 2)) : c < 0.82 ? pick(r, CHARACTER_IDS.slice(2, 5)) : pick(r, CHARACTER_IDS.slice(5));
  return { name, skill, perDay, ageDays, avatar, character };
}

export interface HouseStats {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  assists: number;
  deaths: number;
  xp: number;
  rating: number;
  playtimeSec: number;
  streak: number;
  bestStreak: number;
}

/** Where a player of this skill's rating settles. */
const ratingTarget = (skill: number) => Math.round(RATING_RULES.start + (skill - 0.45) * 700);

/** One match of a house player (`r`: its dice). */
function playOne(p: HousePersona, s: HouseStats, r: () => number): void {
  const players = 4 + Math.floor(r() * 3);
  // the place: a strong player places higher
  const placeRoll = Math.min(0.999, Math.max(0, r() * 0.75 + (1 - p.skill) * 0.45 - 0.1));
  const place = 1 + Math.floor(placeRoll * players);
  const kills = Math.max(0, Math.round((1.5 + 7 * p.skill) * (0.4 + r() * 1.2)));
  const deaths = Math.max(0, Math.round((6.5 - 3.5 * p.skill) * (0.5 + r())));
  const assists = Math.floor(r() * 3 * (0.5 + p.skill));
  s.matches++;
  s.kills += kills;
  s.deaths += deaths;
  s.assists += assists;
  s.playtimeSec += 150 + Math.floor(r() * 150);
  const win = place === 1;
  if (win) {
    s.wins++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.losses++;
    s.streak = 0;
  }
  s.xp += Math.min(XP_RULES.maxPerMatch, XP_RULES.completion + XP_RULES.perKill * kills + XP_RULES.perAssist * assists + (XP_RULES.placement[place - 1] ?? 0));
  // the rating rule of a free-for-all, pulled a little towards where this skill belongs
  const score = (players - place) / (players - 1);
  const pull = (ratingTarget(p.skill) - s.rating) * 0.08;
  s.rating = Math.max(RATING_RULES.floor, Math.round(s.rating + RATING_RULES.k * (score - 0.5) + pull));
}

/** A house player's history up to its first appearance: matches since its account was made. */
export function history(p: HousePersona): HouseStats {
  const r = mulberry32(houseSeedOf(p.name) ^ 0x5eed);
  const s: HouseStats = { matches: 0, wins: 0, losses: 0, kills: 0, assists: 0, deaths: 0, xp: 0, rating: RATING_RULES.start, playtimeSec: 0, streak: 0, bestStreak: 0 };
  const total = Math.max(1, Math.round(p.perDay * p.ageDays * (0.6 + r() * 0.8)));
  for (let i = 0; i < Math.min(total, 1500); i++) playOne(p, s, r);
  return s;
}

/** The matches a house player plays in one hour-step: none most hours, more in the evening (UTC+3). */
export function stepMatches(p: HousePersona, step: number): number {
  const hour = (Math.floor((step * HOUSE_STEP_MS) / 3_600_000) + 3) % 24;
  const daypart = hour < 8 ? 0.25 : hour < 16 ? 0.9 : 1.6;
  const r = mulberry32(hash32(houseSeedOf(p.name), step));
  const expected = (p.perDay / 24) * daypart;
  let n = 0;
  // a few Bernoulli tries make a small Poisson-like count
  for (let i = 0; i < 4; i++) if (r() < expected / 4) n++;
  return n;
}

/** Plays the steps (from, to] for a house player. */
export function advance(p: HousePersona, s: HouseStats, fromStep: number, toStep: number): HouseStats {
  const next = { ...s };
  for (let step = Math.max(fromStep + 1, toStep - 7 * 24 + 1); step <= toStep; step++) {
    const n = stepMatches(p, step);
    if (!n) continue;
    const r = mulberry32(hash32(houseSeedOf(p.name), step, 0x6d));
    for (let i = 0; i < n; i++) playOne(p, next, r);
  }
  return next;
}

// ── the database ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Puts house players in the tables until there are `count` of them (an alias a player already holds is
 * skipped). Returns how many were added.
 */
export async function seedHousePlayers(sql: Sql, count: number, now = new Date()): Promise<number> {
  if (count <= 0) return 0;
  const [have] = await sql<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users WHERE house_player`;
  let missing = count - (have?.n ?? 0);
  if (missing <= 0) return 0;
  let added = 0;
  for (let i = 0; missing > 0 && i < count * 4; i++) {
    const name = houseName(i);
    const p = persona(name);
    const s = history(p);
    const created = new Date(now.getTime() - p.ageDays * DAY - Math.floor((houseSeedOf(name) % 86_400) * 1000));
    const lastSeen = new Date(now.getTime() - (houseSeedOf(name) % 72) * 3_600_000);
    const done = await sql.begin(async (tx) => {
      const [u] = await tx<Array<{ id: string }>>`
        INSERT INTO users (display_name, name_key, house_player, created_at, last_seen_at)
        SELECT ${name}, ${nameKey(name)}, true, ${created}, ${lastSeen}
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE name_key = ${nameKey(name)} AND deleted_at IS NULL)
        ON CONFLICT DO NOTHING RETURNING id`;
      if (!u) return false;
      await tx`
        INSERT INTO profiles (user_id, level, xp, matches_played, matches_completed, wins, losses, kills, assists, deaths, playtime_sec,
                              current_win_streak, best_win_streak, preferred_character, avatar, rating, updated_at)
        VALUES (${u.id}, ${levelForXp(s.xp).level}, ${s.xp}, ${s.matches}, ${s.matches}, ${s.wins}, ${s.losses}, ${s.kills}, ${s.assists}, ${s.deaths}, ${s.playtimeSec},
                ${s.streak}, ${s.bestStreak}, ${p.character}, ${p.avatar}, ${s.rating}, ${lastSeen})`;
      return true;
    });
    if (done) {
      added++;
      missing--;
    }
  }
  await sql`INSERT INTO app_settings (key, value) VALUES (${DRIFT_KEY}, ${sql.json(new Date(Math.floor(now.getTime() / HOUSE_STEP_MS) * HOUSE_STEP_MS).toISOString())}) ON CONFLICT (key) DO NOTHING`;
  return added;
}

/**
 * Plays the hours since the last drift (a week at most) for every house player: their matches, wins,
 * eliminations, level and rating move as a real player's would. One server at a time (the drift row is
 * locked); returns how many players changed.
 */
export async function driftHousePlayers(sql: Sql, now = new Date()): Promise<number> {
  return sql.begin(async (tx) => {
    const [st] = await tx<Array<{ value: unknown }>>`SELECT value FROM app_settings WHERE key = ${DRIFT_KEY} FOR UPDATE`;
    if (!st || typeof st.value !== 'string') return 0;
    const fromStep = Math.floor(new Date(st.value).getTime() / HOUSE_STEP_MS);
    const toStep = Math.floor(now.getTime() / HOUSE_STEP_MS);
    if (!Number.isFinite(fromStep) || toStep <= fromStep) return 0;
    const rows = await tx<Array<{ id: string; name: string; matches: number; wins: number; losses: number; kills: number; assists: number; deaths: number; xp: number; rating: number; playtime: number; streak: number; best: number }>>`
      SELECT u.id, u.display_name AS name, p.matches_completed AS matches, p.wins, p.losses, p.kills, p.assists, p.deaths, p.xp, p.rating,
             p.playtime_sec AS playtime, p.current_win_streak AS streak, p.best_win_streak AS best
      FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.house_player AND u.deleted_at IS NULL`;
    let changed = 0;
    for (const row of rows) {
      const p = persona(row.name);
      const before: HouseStats = { matches: row.matches, wins: row.wins, losses: row.losses, kills: row.kills, assists: row.assists, deaths: row.deaths, xp: row.xp, rating: row.rating, playtimeSec: row.playtime, streak: row.streak, bestStreak: row.best };
      const s = advance(p, before, fromStep, toStep);
      if (s.matches === before.matches) continue;
      changed++;
      await tx`
        UPDATE profiles SET matches_played = matches_played + ${s.matches - before.matches}, matches_completed = ${s.matches}, wins = ${s.wins}, losses = ${s.losses},
               kills = ${s.kills}, assists = ${s.assists}, deaths = ${s.deaths}, xp = ${s.xp}, level = ${levelForXp(s.xp).level}, rating = ${s.rating},
               playtime_sec = ${s.playtimeSec}, current_win_streak = ${s.streak}, best_win_streak = ${s.bestStreak}, updated_at = ${now}
        WHERE user_id = ${row.id}`;
      await tx`UPDATE users SET last_seen_at = ${now} WHERE id = ${row.id}`;
    }
    await tx`UPDATE app_settings SET value = ${tx.json(new Date(toStep * HOUSE_STEP_MS).toISOString())}, updated_at = now() WHERE key = ${DRIFT_KEY}`;
    return changed;
  });
}

/** Seeds, catches up, then drifts every half hour (unref'd; never a reason for the server to stop). */
export function scheduleHousePlayers(sql: Sql, log: { info(m: string, f?: Record<string, unknown>): void; warn(m: string, f?: Record<string, unknown>): void }, count: number): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      const added = await seedHousePlayers(sql, count);
      if (added) log.info('house players added', { added });
      await driftHousePlayers(sql);
    } catch (e) {
      log.warn('house players not ready', { err: e as Error });
    }
  };
  void run();
  const timer = setInterval(() => void run(), 30 * 60_000);
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
