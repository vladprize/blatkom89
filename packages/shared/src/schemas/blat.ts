/** $BLAT API (V2.0): the balance, its history, the level rewards and the referral programme. */
import type { BlatSource } from '../game-rules/blat.js';

export interface BlatEntry {
  at: string;
  delta: number;
  balanceAfter: number;
  source: BlatSource;
  /** The operation id: `level:7`, `referral:<id>`, an admin's note. */
  ref: string | null;
  /** Referral: the invited player's alias. */
  who?: string | null;
}

export interface BlatReferralRow {
  name: string;
  at: string;
  status: 'pending' | 'confirmed' | 'held' | 'rejected';
  reward: number;
}

export interface BlatResponse {
  balance: number;
  earned: number;
  /** By source (levels, referrals, grants). */
  bySource: Record<BlatSource, number>;
  level: number;
  /** The levels paid so far (1…level) and what the next level pays. */
  nextLevel: { level: number; reward: number } | null;
  referral: {
    code: string;
    link: string;
    /** t.me link that opens the bot with the code (when the bot is set up). */
    telegramLink: string | null;
    invited: number;
    confirmed: number;
    pending: number;
    held: number;
    earned: number;
    /** What the next confirmed invitation pays. */
    nextReward: number;
    recent: BlatReferralRow[];
  };
  history: BlatEntry[];
  /** Credited just now by this request (levels reached before $BLAT existed). */
  justCredited: number;
}

/** V2.0 part C: BLAT DROP — the announcement date (null: not set yet) and the server's clock. */
export interface BlatDropInfo {
  announceAt: string | null;
  serverNow: string;
}
