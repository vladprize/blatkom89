/** Invitations API (V2.0; v0.2.18: paid in talons): GET /api/referrals. */

export interface ReferralRow {
  name: string;
  at: string;
  status: 'pending' | 'confirmed' | 'held' | 'rejected';
  /** Talons paid for this invitation (0 until it counts). */
  reward: number;
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
}
