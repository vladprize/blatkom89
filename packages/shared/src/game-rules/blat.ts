/**
 * $BLAT (V2.0): in-game points. Not money: they can't be bought, sold, withdrawn or exchanged for anything;
 * since v0.2.17 they change hands only as stakes in the $BLAT Tournament (both sides stake the same, the
 * winners take the pool). Every credit is made by the
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

/**
 * Where a $BLAT movement came from (the ledger's reason). v0.2.17: `allocation` — the founder's and the
 * partners' shares (an administrator's action, from their pools); `stake` / `stake_win` / `stake_refund`
 * — the $BLAT Tournament (a stake reserved at the start, the pool won, a stake returned).
 */
export const BLAT_SOURCES = ['level', 'referral', 'grant', 'allocation', 'stake', 'stake_win', 'stake_refund'] as const;
export type BlatSource = (typeof BLAT_SOURCES)[number];

/**
 * v0.2.17 — the owner: «the whole supply is capped at 2 000 000 000 $BLAT: 320 000 000 mine (the biggest
 * holding), 100 000 000 for my friends, 300 000 000 for influencers, 1 260 000 000 for the players» (the
 * 20 000 000 left over is the reserve). Every credit comes out of a pool (`blat_pools` on the server): the
 * players' pool pays levels and invitations, the others only an administrator's allocation. Stakes in the
 * $BLAT Tournament move $BLAT between players and create none.
 */
export const BLAT_SUPPLY = 2_000_000_000;
export const BLAT_POOLS = Object.freeze({ players: 1_260_000_000, founder: 320_000_000, influencers: 300_000_000, friends: 100_000_000, reserve: 20_000_000 });
export type BlatPool = keyof typeof BLAT_POOLS;
export const BLAT_POOL_IDS = Object.keys(BLAT_POOLS) as BlatPool[];
/** What the founder's account holds after «Make founder» (the founder's pool, all of it). */
export const BLAT_FOUNDER_HOLDING = BLAT_POOLS.founder;
/** The founder's account: level and badge (v0.2.17). */
export const FOUNDER_LEVEL = 87;

/**
 * v0.2.17: the project's wallet in the Solana network, shown in the $BLAT section (the owner's address;
 * the server's PROJECT_SOL_WALLET overrides it). Nothing in the game sends to it or reads from it.
 */
export const PROJECT_SOL_WALLET = '7ktcRxxhp9gijH4Pbbr4HBckP8HocFN8YzngvTqBArJ1';
/** A Solana address: 32–44 base58 characters. */
export const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

/**
 * v0.2.17: the BLAT DROP announcement date the owner gave («the timer starts now: 3 months and 15 days» —
 * on 24 October 2026), 8 February 2027, 23:00 in Cyprus. Used when neither an administrator (/admin →
 * $BLAT) nor the server's BLAT_DROP_ANNOUNCE_AT has set one; both still override it.
 */
export const BLAT_DROP_DEFAULT_ANNOUNCE_AT = '2027-02-08T21:00:00.000Z';
