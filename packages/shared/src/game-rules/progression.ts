/**
 * Progression rules. Pure functions; the server is the only caller that persists results.
 * All numbers are configuration and can be tuned without touching the match code.
 */
export const XP_RULES = Object.freeze({
  completion: 50,
  perKill: 10,
  placement: [100, 50, 25] as readonly number[],
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
  deaths: number;
  /** 1-based placement among players present at the end of the match. */
  place: number;
  playersAtEnd: number;
  completed: boolean;
  /** At least one other human was in a private (invite) room. */
  withFriends: boolean;
}

export function xpForMatch(p: MatchPerformance): number {
  if (!p.completed) return 0;
  let xp = XP_RULES.completion + XP_RULES.perKill * p.kills;
  if (p.playersAtEnd >= 2) {
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

export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  first_match: { id: 'first_match', title: 'Первое дело', description: 'Доиграть первый матч.', xpReward: 25 },
  first_win: { id: 'first_win', title: 'Авторитет', description: 'Победить в матче.', xpReward: 50 },
  ten_matches: { id: 'ten_matches', title: 'Свой человек', description: 'Доиграть 10 матчей.', xpReward: 75 },
  win_streak: {
    id: 'win_streak',
    title: 'Держит район',
    description: `Победить ${WIN_STREAK_TARGET} матча подряд.`,
    xpReward: 100,
  },
  multi_kill: {
    id: 'multi_kill',
    title: 'Разборка',
    description: `${MULTI_KILL_TARGET} устранений за один матч.`,
    xpReward: 50,
  },
  played_with_friends: {
    id: 'played_with_friends',
    title: 'Свои люди',
    description: 'Сыграть матч с друзьями по приглашению.',
    xpReward: 25,
  },
};

export interface ProgressSnapshot {
  matchesCompleted: number;
  wins: number;
  currentWinStreak: number;
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
  add('first_win', match.completed && match.place === 1 && match.playersAtEnd >= 2);
  add('ten_matches', after.matchesCompleted >= 10);
  add('win_streak', after.currentWinStreak >= WIN_STREAK_TARGET);
  add('multi_kill', match.kills >= MULTI_KILL_TARGET);
  add('played_with_friends', match.completed && match.withFriends);
  return out;
}
