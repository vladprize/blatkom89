/** Invitations API (V2.0; v0.2.18: paid in talons): GET /api/referrals. */

export interface ReferralRow {
  name: string;
  at: string;
  status: 'pending' | 'confirmed' | 'held' | 'rejected';
  /** Talons paid for this invitation (0 until it counts). */
  reward: number;
  /** v0.2.25: BLATS paid for this friend (0 until their matches are played), and how many whole matches they have. */
  blats?: number;
  matches?: number;
  /** v0.2.25: 'paid', 'pending', 'capped' (over the month's limit), 'held'/'rejected' (a check), 'legacy' (before the BLATS). */
  blatsStatus?: string;
}

export interface ReferralResponse {
  code: string;
  link: string;
  /** t.me link that opens the bot with the code (when the bot is set up). */
  telegramLink: string | null;
  invited: number;
  confirmed: number;
  pending: number;
  held: number;
  /** Talons earned for invitations. */
  earned: number;
  /** Talons the next invitation that counts pays. */
  reward: number;
  recent: ReferralRow[];
  /** v0.2.25: the BLATS part — what a friend brings, after how many matches, the month's limit and what it paid. */
  blats?: { amount: number; matches: number; monthlyCap: number; earned: number; thisMonth: number };
}
