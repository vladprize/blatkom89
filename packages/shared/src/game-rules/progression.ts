/**
 * Progression rules. Pure functions; the server is the only caller that persists results.
 * All numbers are configuration and can be tuned without touching the match code.
 */
export const XP_RULES = Object.freeze({
  completion: 50,
  perKill: 10,
  perAssist: 5,
  /** Capture the flag: a flag captured; base capture: a base captured. */
  perObjective: 15,
  placement: [100, 50, 25] as readonly number[],
  /** Team matches: every player of the winning team (a draw gives both teams the smaller bonus). */
  teamWin: 75,
  teamDraw: 25,
  playedWithFriends: 20,
  maxPerMatch: 400,
});

export const LEVEL_CAP = 99;

/** XP needed to go from `level` to `level + 1`. */
export function levelStepCost(level: number): number {
  return 150 + 50 * (level - 1);
}

/** Total XP required to reach `level` (level 1 = 0 XP). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += levelStepCost(l);
  return total;
}

export function levelForXp(xp: number): { level: number; intoLevel: number; nextLevelCost: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < LEVEL_CAP && remaining >= levelStepCost(level)) {
    remaining -= levelStepCost(level);
    level++;
  }
  return { level, intoLevel: remaining, nextLevelCost: level >= LEVEL_CAP ? 0 : levelStepCost(level) };
}

export interface MatchPerformance {
  kills: number;
  /** Assists (damage on a victim someone else eliminated). Optional for older callers. */
  assists?: number;
  deaths: number;
  /** 1-based placement among players present at the end of the match. */
  place: number;
  playersAtEnd: number;
  completed: boolean;
  /** At least one other human was in a private (invite) room. */
  withFriends: boolean;
  /** Another player finished with exactly the same result (a draw for this place). */
  sharedPlace?: boolean;
  /** Team matches: how the player's team did (placement does not apply then). */
  teamOutcome?: 'win' | 'loss' | 'draw';
  /** Capture the flag / base capture: flags or bases captured. */
  objectives?: number;
}

/**
 * A win is a sole first place in a match that had at least one opponent at the end; in a team
 * match, being on the winning team.
 */
export function isWin(p: MatchPerformance): boolean {
  if (p.teamOutcome) return p.completed && p.teamOutcome === 'win' && p.playersAtEnd >= 2;
  return p.completed && p.place === 1 && !p.sharedPlace && p.playersAtEnd >= 2;
}

/** Competition ranking ("1, 1, 3"): equal points, eliminations and deaths share a place. */
export function rankPlaces<T extends { score: number; kills: number; deaths: number }>(sorted: readonly T[]): number[] {
  const places: number[] = [];
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    places.push(prev && prev.score === s.score && prev.kills === s.kills && prev.deaths === s.deaths ? places[i - 1]! : i + 1);
  });
  return places;
}

/**
 * Rating (the Top-100 «Rating» table): everyone starts at 1000. Free-for-all: up to ±16 by place among
 * everyone present at the end (1st of 4: +16, 2nd +5, 3rd −5, 4th −16); team modes: a win +16, a loss
 * −16, a draw 0; leaving before the end counts as −16. Never below 0.
 */
export const RATING_RULES = Object.freeze({ start: 1000, k: 32, team: 16, leaver: -16, floor: 0 });

export function ratingDelta(p: Pick<MatchPerformance, 'place' | 'playersAtEnd' | 'completed' | 'teamOutcome'>): number {
  if (!p.completed) return RATING_RULES.leaver;
  if (p.teamOutcome) return p.teamOutcome === 'win' ? RATING_RULES.team : p.teamOutcome === 'loss' ? -RATING_RULES.team : 0;
  if (p.playersAtEnd < 2) return 0;
  const score = Math.min(1, Math.max(0, (p.playersAtEnd - p.place) / (p.playersAtEnd - 1)));
  return Math.round(RATING_RULES.k * (score - 0.5));
}

export function xpForMatch(p: MatchPerformance): number {
  if (!p.completed) return 0;
  let xp = XP_RULES.completion + XP_RULES.perKill * p.kills + XP_RULES.perAssist * (p.assists ?? 0) + XP_RULES.perObjective * (p.objectives ?? 0);
  if (p.teamOutcome) {
    if (p.playersAtEnd >= 2) xp += p.teamOutcome === 'win' ? XP_RULES.teamWin : p.teamOutcome === 'draw' ? XP_RULES.teamDraw : 0;
  } else if (p.playersAtEnd >= 2) {
    const bonus = XP_RULES.placement[p.place - 1];
    if (bonus && (p.place === 1 || p.playersAtEnd >= p.place + 1)) xp += bonus;
  }
  if (p.withFriends) xp += XP_RULES.playedWithFriends;
  return Math.min(xp, XP_RULES.maxPerMatch);
}

export const ACHIEVEMENT_IDS = [
  'first_match',
  'first_win',
  'ten_matches',
  'win_streak',
  'multi_kill',
  'played_with_friends',
  // v0.3: fourteen more — long-term goals, match feats, team and objective play, levels
  'matches_50',
  'matches_100',
  'wins_10',
  'wins_50',
  'streak_5',
  'kills_10',
  'flawless',
  'comeback',
  'assists_5',
  'team_win',
  'objective',
  'objectives_3',
  'level_10',
  'level_25',
  // v0.3 part 4: story chapters (talons and unlocks come with them: story/missions.ts STORY_CHAPTERS)
  'story_petya_1',
  'story_uchastkovy_1',
  'story_petya_2',
  'story_uchastkovy_2',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  xpReward: number;
}

export const WIN_STREAK_TARGET = 3;
export const MULTI_KILL_TARGET = 5;
/** Thresholds of the v0.3 achievements (configuration). */
export const ACHIEVEMENT_TARGETS = Object.freeze({ matches: [50, 100], wins: [10, 50], longStreak: 5, bigKill: 10, assists: 5, comebackDeaths: 5, objectives: 3, levels: [10, 25] });

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  first_match: { id: 'first_match', title: 'First Job', description: 'Finish your first match.', xpReward: 25 },
  first_win: { id: 'first_win', title: 'Avtoritet', description: 'Win a match.', xpReward: 50 },
  ten_matches: { id: 'ten_matches', title: 'One of Us', description: 'Finish 10 matches.', xpReward: 75 },
  win_streak: {
    id: 'win_streak',
    title: 'Runs the District',
    description: `Win ${WIN_STREAK_TARGET} matches in a row.`,
    xpReward: 100,
  },
  multi_kill: {
    id: 'multi_kill',
    title: 'Showdown',
    description: `${MULTI_KILL_TARGET} eliminations in one match.`,
    xpReward: 50,
  },
  played_with_friends: {
    id: 'played_with_friends',
    title: 'Our Crowd',
    description: 'Play a match with friends you invited.',
    xpReward: 25,
  },
  matches_50: { id: 'matches_50', title: 'Regular', description: `Finish ${ACHIEVEMENT_TARGETS.matches[0]} matches.`, xpReward: 150 },
  matches_100: { id: 'matches_100', title: 'Old Hand', description: `Finish ${ACHIEVEMENT_TARGETS.matches[1]} matches.`, xpReward: 250 },
  wins_10: { id: 'wins_10', title: 'Respected', description: `Win ${ACHIEVEMENT_TARGETS.wins[0]} matches.`, xpReward: 150 },
  wins_50: { id: 'wins_50', title: 'District Legend', description: `Win ${ACHIEVEMENT_TARGETS.wins[1]} matches.`, xpReward: 300 },
  streak_5: { id: 'streak_5', title: 'Unstoppable', description: `Win ${ACHIEVEMENT_TARGETS.longStreak} matches in a row.`, xpReward: 200 },
  kills_10: { id: 'kills_10', title: 'No Limits', description: `${ACHIEVEMENT_TARGETS.bigKill} eliminations in one match.`, xpReward: 100 },
  flawless: { id: 'flawless', title: 'Untouchable', description: 'Win a match without being eliminated once.', xpReward: 100 },
  comeback: { id: 'comeback', title: 'Second Wind', description: `Win a match after being eliminated ${ACHIEVEMENT_TARGETS.comebackDeaths} times.`, xpReward: 100 },
  assists_5: { id: 'assists_5', title: 'Helping Hand', description: `${ACHIEVEMENT_TARGETS.assists} assists in one match.`, xpReward: 50 },
  team_win: { id: 'team_win', title: 'All for One', description: 'Win a team match.', xpReward: 50 },
  objective: { id: 'objective', title: 'Job Done', description: 'Capture a flag or a base.', xpReward: 50 },
  objectives_3: { id: 'objectives_3', title: 'Raider', description: `Capture ${ACHIEVEMENT_TARGETS.objectives} flags or bases in one match.`, xpReward: 100 },
  level_10: { id: 'level_10', title: 'Big Name', description: `Reach level ${ACHIEVEMENT_TARGETS.levels[0]}.`, xpReward: 100 },
  level_25: { id: 'level_25', title: 'Boss of the District', description: `Reach level ${ACHIEVEMENT_TARGETS.levels[1]}.`, xpReward: 250 },
  story_petya_1: { id: 'story_petya_1', title: 'Master of the Yard', description: 'Story: finish chapter 1 of «My Yard».', xpReward: 100 },
  story_uchastkovy_1: { id: 'story_uchastkovy_1', title: 'First Report', description: 'Story: finish chapter 1 of «The Report».', xpReward: 100 },
  story_petya_2: { id: 'story_petya_2', title: 'Garage Authority', description: 'Story: finish chapter 2 of «My Yard».', xpReward: 150 },
  story_uchastkovy_2: { id: 'story_uchastkovy_2', title: 'Market Watch', description: 'Story: finish chapter 2 of «The Report».', xpReward: 150 },
};

/** Achievements unlocked by reaching a level (checked after the match's experience is counted). */
const LEVEL_ACHIEVEMENTS: ReadonlyArray<[AchievementId, number]> = [
  ['level_10', ACHIEVEMENT_TARGETS.levels[0]!],
  ['level_25', ACHIEVEMENT_TARGETS.levels[1]!],
];

export interface ProgressSnapshot {
  matchesCompleted: number;
  wins: number;
  currentWinStreak: number;
  /** The level after this match's experience (level achievements); left out, they are not checked. */
  level?: number;
}

/** Returns achievements unlocked by this match that are not yet owned. */
export function evaluateAchievements(
  after: ProgressSnapshot,
  match: MatchPerformance,
  owned: ReadonlySet<AchievementId>,
): AchievementId[] {
  const out: AchievementId[] = [];
  const add = (id: AchievementId, cond: boolean) => {
    if (cond && !owned.has(id)) out.push(id);
  };
  add('first_match', match.completed && after.matchesCompleted >= 1);
  add('first_win', isWin(match));
  add('ten_matches', after.matchesCompleted >= 10);
  add('win_streak', after.currentWinStreak >= WIN_STREAK_TARGET);
  add('multi_kill', match.kills >= MULTI_KILL_TARGET);
  add('played_with_friends', match.completed && match.withFriends);
  const T = ACHIEVEMENT_TARGETS;
  const won = isWin(match);
  add('matches_50', after.matchesCompleted >= T.matches[0]!);
  add('matches_100', after.matchesCompleted >= T.matches[1]!);
  add('wins_10', after.wins >= T.wins[0]!);
  add('wins_50', after.wins >= T.wins[1]!);
  add('streak_5', after.currentWinStreak >= T.longStreak);
  add('kills_10', match.kills >= T.bigKill);
  add('flawless', won && match.deaths === 0);
  add('comeback', won && match.deaths >= T.comebackDeaths);
  add('assists_5', (match.assists ?? 0) >= T.assists);
  add('team_win', won && !!match.teamOutcome);
  add('objective', match.completed && (match.objectives ?? 0) >= 1);
  add('objectives_3', match.completed && (match.objectives ?? 0) >= T.objectives);
  if (after.level !== undefined) for (const [id, lvl] of LEVEL_ACHIEVEMENTS) add(id, after.level >= lvl);
  return out;
}

/** Persistent progression counters the match outcome depends on. */
export interface ProgressState {
  xp: number;
  level: number;
  matchesCompleted: number;
  wins: number;
  currentWinStreak: number;
}

export interface MatchProgressOutcome {
  won: boolean;
  /** Completed with at least one opponent and not a sole first place. */
  lost: boolean;
  /** Win streak after this match (solo matches keep it, losses and leaving reset it). */
  streak: number;
  unlocked: AchievementId[];
  /** Match XP plus achievement rewards. */
  xpGained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
}

/**
 * The single source of progression rules for one finished match: used by the server recorder
 * (PostgreSQL profiles) and by the browser-only profile of the offline demo, so both level alike.
 */
export function applyMatchProgress(prev: ProgressState, perf: MatchPerformance, owned: ReadonlySet<AchievementId>): MatchProgressOutcome {
  const won = isWin(perf);
  const lost = perf.completed && !won && perf.playersAtEnd >= 2;
  const streak = won ? prev.currentWinStreak + 1 : perf.completed && perf.playersAtEnd < 2 ? prev.currentWinStreak : 0;
  const after: ProgressSnapshot = { matchesCompleted: prev.matchesCompleted + (perf.completed ? 1 : 0), wins: prev.wins + (won ? 1 : 0), currentWinStreak: streak };
  const reward = (ids: readonly AchievementId[]) => ids.reduce((sum, a) => sum + ACHIEVEMENTS[a].xpReward, 0);
  const unlocked = evaluateAchievements(after, perf, owned);
  let xpGained = xpForMatch(perf) + reward(unlocked);
  // level achievements look at the level this match reaches (their own reward counts on top)
  const reached = levelForXp(prev.xp + xpGained).level;
  const byLevel = evaluateAchievements({ ...after, level: reached }, perf, new Set([...owned, ...unlocked]));
  unlocked.push(...byLevel);
  xpGained += reward(byLevel);
  const totalXp = prev.xp + xpGained;
  const level = levelForXp(totalXp).level;
  return { won, lost, streak, unlocked, xpGained, totalXp, level, leveledUp: level > prev.level };
}
