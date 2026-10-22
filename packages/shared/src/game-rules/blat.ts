/**
 * $BLAT (V2.0): in-game points that only accumulate. Not money and not a cryptocurrency: they can't be
 * bought, sold, withdrawn, given to another player or exchanged for anything. Every credit is made by the
 * server, has its own operation id (`ref`) and is written to the currency ledger, so the same reward can
 * never be paid twice (docs/BLAT.md).
 *
 * The numbers below are configuration. The level table is a DRAFT the owner has to approve before the
 * public launch; the referral scale is the owner's.
 */

/** Hard bounds of a balance (a sanity check on every credit). */
export const BLAT_LIMITS = Object.freeze({ maxBalance: 2_000_000_000, maxCredit: 1_000_000 });

/**
 * Reward for reaching a level (level 1 — the start — is a welcome reward). DRAFT, to be approved:
 * 300 at level 1, then +50 a level up to 10, +100 up to 20, +200 up to 30, +300 up to 40, +325 up to 50
 * (10 000), and 10 000 for every level after that.
 */
export const BLAT_LEVEL_STEPS: ReadonlyArray<{ upTo: number; step: number }> = Object.freeze([
  { upTo: 10, step: 50 },
  { upTo: 20, step: 100 },
  { upTo: 30, step: 200 },
  { upTo: 40, step: 300 },
  { upTo: 50, step: 325 },
]);
export const BLAT_LEVEL_FIRST = 300;
export const BLAT_LEVEL_CAP_REWARD = 10_000;

export function blatForLevel(level: number): number {
  const L = Math.floor(level);
  if (!Number.isFinite(L) || L < 1) return 0;
  let reward = BLAT_LEVEL_FIRST;
  let at = 1;
  for (const s of BLAT_LEVEL_STEPS) {
    while (at < L && at < s.upTo) {
      at++;
      reward += s.step;
    }
  }
  return Math.min(BLAT_LEVEL_CAP_REWARD, at < L ? BLAT_LEVEL_CAP_REWARD : reward);
}

/** Everything the levels from 1 to `level` pay together. */
export function blatForLevelsUpTo(level: number): number {
  let sum = 0;
  for (let l = 1; l <= level; l++) sum += blatForLevel(l);
  return sum;
}

/**
 * Referrals (the owner's scale): the reward for the n-th confirmed invitation. A higher rate applies only
 * to the new ones — rewards already paid are never recounted.
 */
export const REFERRAL_TIERS: ReadonlyArray<{ from: number; reward: number }> = Object.freeze([
  { from: 1, reward: 1_500 },
  { from: 5, reward: 3_000 },
  { from: 10, reward: 5_000 },
  { from: 25, reward: 7_500 },
  { from: 50, reward: 10_000 },
  { from: 100, reward: 12_500 },
  { from: 250, reward: 15_000 },
  { from: 500, reward: 20_000 },
]);

export function referralReward(ordinal: number): number {
  let r = 0;
  for (const t of REFERRAL_TIERS) if (ordinal >= t.from) r = t.reward;
  return r;
}

/**
 * When an invitation counts: a new account opened through the link plays a whole online match
 * (completed, at least `minMatchSec` long, and they actually played — dealt damage). More than `dailyCap`
 * confirmations of one inviter in 24 hours, or a flagged account on either side, wait for a manual check.
 */
export const REFERRAL_RULES = Object.freeze({ minMatchSec: 60, dailyCap: 20 });

/** A referral code: the player's own (8 letters and digits) or a partner's (an author's name). */
export const REF_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
export const isRefCode = (v: unknown): v is string => typeof v === 'string' && REF_CODE_RE.test(v);

/** Where a $BLAT credit came from (the ledger's reason). */
export const BLAT_SOURCES = ['level', 'referral', 'grant'] as const;
export type BlatSource = (typeof BLAT_SOURCES)[number];

/**
 * BLAT DROP (V2.0 part C): milliseconds left by the server's clock. `serverNow` came with the answer
 * that arrived at `fetchedAt` by this device's clock; the difference is kept, so a device whose clock is
 * wrong still counts down to the same second as everyone.
 */
export function dropMsLeft(announceAt: string, serverNow: string, fetchedAt: number, now: number): number {
  return Date.parse(announceAt) - (now + (Date.parse(serverNow) - fetchedAt));
}

/** BLAT DROP (V2.0 part C): days, hours, minutes and seconds left (never below zero). */
export function dropCountdown(msLeft: number): { d: number; h: number; m: number; s: number } {
  const left = Math.max(0, Math.floor((Number.isFinite(msLeft) ? msLeft : 0) / 1000));
  return { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
}
