/**
 * Browser-only player profile of the offline demo (no server): nickname, XP and level, statistics,
 * achievements and recent practice matches. Progression goes through the same shared rules as the
 * server recorder (`applyMatchProgress`), so a level means the same in both builds. Pure functions;
 * persistence is in localStore.ts. The online build never uses this — there the server owns progress.
 */
import { ACHIEVEMENT_IDS, ACHIEVEMENTS, applyMatchProgress, displayNameSchema, isAvatarId, isCharacterId, isMapId, levelForXp } from '@blatkom/shared';
import type { AchievementId, AchievementStatus, AvatarId, CharacterId, MapId, MatchHistoryEntry, PersonalResult, PublicProfile, Standing, TeamResultSummary } from '@blatkom/shared';

export const LOCAL_HISTORY_MAX = 20;

export interface LocalMatch {
  matchId: string;
  endedAt: string;
  mapId: MapId;
  character: CharacterId;
  durationMs: number;
  place: number;
  players: number;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  xpGained: number;
  won: boolean;
}

export interface LocalProfile {
  v: 1;
  displayName: string;
  createdAt: string;
  xp: number;
  matchesPlayed: number;
  matchesCompleted: number;
  wins: number;
  losses: number;
  kills: number;
  assists: number;
  deaths: number;
  playtimeSec: number;
  currentWinStreak: number;
  bestWinStreak: number;
  /** Unlock time per achievement. */
  achievements: Partial<Record<AchievementId, string>>;
  /** Newest first, at most LOCAL_HISTORY_MAX. */
  history: LocalMatch[];
  /** Profile avatar (game-rules/avatars.ts); absent: the character's portrait. */
  avatar?: AvatarId;
}

export function createLocalProfile(name: string, now = new Date()): LocalProfile {
  return {
    v: 1,
    displayName: displayNameSchema.parse(name),
    createdAt: now.toISOString(),
    xp: 0,
    matchesPlayed: 0,
    matchesCompleted: 0,
    wins: 0,
    losses: 0,
    kills: 0,
    assists: 0,
    deaths: 0,
    playtimeSec: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    achievements: {},
    history: [],
  };
}

export function renameLocalProfile(p: LocalProfile, name: string): LocalProfile {
  return { ...p, displayName: displayNameSchema.parse(name) };
}

/** Picks an avatar (null removes it). */
export function setLocalAvatar(p: LocalProfile, avatar: AvatarId | null): LocalProfile {
  const next: LocalProfile = { ...p };
  if (avatar && isAvatarId(avatar)) next.avatar = avatar;
  else delete next.avatar;
  return next;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0);
const iso = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : fallback);

/** Validates what comes back from storage (it may be edited by hand or written by an older build). */
export function sanitizeLocalProfile(raw: unknown, now = new Date()): LocalProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = displayNameSchema.safeParse(r.displayName);
  if (!name.success) return null;
  const nowIso = now.toISOString();
  const achievements: LocalProfile['achievements'] = {};
  if (r.achievements && typeof r.achievements === 'object') {
    for (const id of ACHIEVEMENT_IDS) {
      const at = (r.achievements as Record<string, unknown>)[id];
      if (typeof at === 'string') achievements[id] = iso(at, nowIso);
    }
  }
  const history: LocalMatch[] = [];
  if (Array.isArray(r.history)) {
    for (const h of r.history.slice(0, LOCAL_HISTORY_MAX)) {
      if (!h || typeof h !== 'object') continue;
      const m = h as Record<string, unknown>;
      if (typeof m.matchId !== 'string' || typeof m.mapId !== 'string' || !isMapId(m.mapId) || typeof m.character !== 'string' || !isCharacterId(m.character)) continue;
      history.push({
        matchId: m.matchId.slice(0, 64),
        endedAt: iso(m.endedAt, nowIso),
        mapId: m.mapId,
        character: m.character,
        durationMs: count(m.durationMs),
        place: Math.max(1, count(m.place)),
        players: Math.max(1, count(m.players)),
        kills: count(m.kills),
        assists: count(m.assists),
        deaths: count(m.deaths),
        score: count(m.score),
        xpGained: count(m.xpGained),
        won: m.won === true,
      });
    }
  }
  return {
    v: 1,
    displayName: name.data,
    createdAt: iso(r.createdAt, nowIso),
    xp: count(r.xp),
    matchesPlayed: count(r.matchesPlayed),
    matchesCompleted: count(r.matchesCompleted),
    wins: count(r.wins),
    losses: count(r.losses),
    kills: count(r.kills),
    assists: count(r.assists),
    deaths: count(r.deaths),
    playtimeSec: count(r.playtimeSec),
    currentWinStreak: count(r.currentWinStreak),
    bestWinStreak: count(r.bestWinStreak),
    achievements,
    history,
    ...(isAvatarId(r.avatar) ? { avatar: r.avatar } : {}),
  };
}

export interface LocalMatchInput {
  matchId: string;
  reason: 'time' | 'score' | 'aborted';
  durationMs: number;
  mapId: MapId;
  standings: Standing[];
  /** Standing id of the local player. */
  localId: string;
  /** Team modes: the team result (the outcome replaces the placement bonus, like online). */
  teams?: TeamResultSummary;
}

/**
 * Applies one finished practice match. Returns null when the match was already recorded (the
 * results screen can be shown again) or the local player is not in the standings.
 */
export function recordLocalMatch(p: LocalProfile, m: LocalMatchInput, now = new Date()): { profile: LocalProfile; personal: PersonalResult } | null {
  if (p.history.some((h) => h.matchId === m.matchId)) return null;
  const me = m.standings.find((s) => s.id === m.localId);
  if (!me) return null;
  const completed = m.reason !== 'aborted';
  const perf = {
    kills: me.kills,
    assists: me.assists,
    deaths: me.deaths,
    place: me.place,
    playersAtEnd: m.standings.length,
    completed,
    withFriends: false,
    sharedPlace: m.standings.some((s) => s.id !== me.id && s.place === me.place),
    ...(m.teams && (me.team === 0 || me.team === 1) ? { teamOutcome: m.teams.winner === null ? ('draw' as const) : m.teams.winner === me.team ? ('win' as const) : ('loss' as const) } : {}),
    objectives: me.objectives ?? 0,
  };
  const prev = { xp: p.xp, level: levelForXp(p.xp).level, matchesCompleted: p.matchesCompleted, wins: p.wins, currentWinStreak: p.currentWinStreak };
  const o = applyMatchProgress(prev, perf, new Set(Object.keys(p.achievements) as AchievementId[]));
  const at = now.toISOString();
  const achievements = { ...p.achievements };
  for (const a of o.unlocked) achievements[a] = at;
  const entry: LocalMatch = {
    matchId: m.matchId,
    endedAt: at,
    mapId: m.mapId,
    character: me.character,
    durationMs: Math.max(0, Math.round(m.durationMs)),
    place: me.place,
    players: m.standings.length,
    kills: me.kills,
    assists: me.assists,
    deaths: me.deaths,
    score: me.score,
    xpGained: o.xpGained,
    won: o.won,
  };
  const profile: LocalProfile = {
    ...p,
    xp: o.totalXp,
    matchesPlayed: p.matchesPlayed + 1,
    matchesCompleted: p.matchesCompleted + (completed ? 1 : 0),
    wins: p.wins + (o.won ? 1 : 0),
    losses: p.losses + (o.lost ? 1 : 0),
    kills: p.kills + me.kills,
    assists: p.assists + me.assists,
    deaths: p.deaths + me.deaths,
    playtimeSec: p.playtimeSec + Math.max(0, Math.round(m.durationMs / 1000)),
    currentWinStreak: o.streak,
    bestWinStreak: Math.max(p.bestWinStreak, o.streak),
    achievements,
    history: [entry, ...p.history].slice(0, LOCAL_HISTORY_MAX),
  };
  return { profile, personal: { xpGained: o.xpGained, totalXp: o.totalXp, level: o.level, leveledUp: o.leveledUp, newAchievements: o.unlocked } };
}

/** The same shapes the online profile screen renders (`/api/me`, history, achievements). */
export function localProfileView(p: LocalProfile, preferredCharacter: CharacterId | null): { profile: PublicProfile; history: MatchHistoryEntry[]; achievements: AchievementStatus[] } {
  const lvl = levelForXp(p.xp);
  return {
    profile: {
      id: 'local',
      displayName: p.displayName,
      telegramLinked: false,
      createdAt: p.createdAt,
      level: lvl.level,
      xp: p.xp,
      xpIntoLevel: lvl.intoLevel,
      xpForNextLevel: lvl.nextLevelCost,
      matchesPlayed: p.matchesPlayed,
      matchesCompleted: p.matchesCompleted,
      wins: p.wins,
      losses: p.losses,
      kills: p.kills,
      assists: p.assists,
      deaths: p.deaths,
      playtimeSec: p.playtimeSec,
      currentWinStreak: p.currentWinStreak,
      bestWinStreak: p.bestWinStreak,
      preferredCharacter,
      avatar: p.avatar ?? null,
      tokens: 0,
      diamonds: 0,
      email: null,
    },
    history: p.history.map((h) => ({ ...h })),
    achievements: ACHIEVEMENT_IDS.map((id) => ({ id, title: ACHIEVEMENTS[id].title, description: ACHIEVEMENTS[id].description, unlockedAt: p.achievements[id] ?? null })),
  };
}
