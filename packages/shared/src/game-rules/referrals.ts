/**
 * Invitations (V2.0; v0.2.18: paid in talons). A new account opened through a player's link is attached
 * to them; it counts once that account plays a whole online match, and the inviter gets REFERRAL_TALONS.
 * Every credit is made by the server, has its own operation id (`referral:<invited player's id>`) and is
 * written to the currency ledger, so the same invitation is never paid twice (docs/ECONOMY.md).
 *
 * Until v0.2.17 invitations and levels paid $BLAT — in-game points the owner retired with the whole crypto
 * theme in v0.2.18 (the database keeps what was credited; nothing pays or shows them any more).
 */

/** Talons for every invitation that counts (the price of the first talon character). */
export const REFERRAL_TALONS = 150;

/**
 * When an invitation counts: a new account opened through the link plays a whole online match
 * (completed, at least `minMatchSec` long, and they actually played — dealt damage). More than `dailyCap`
 * confirmations of one inviter in 24 hours, or a flagged account on either side, wait for a manual check.
 */
export const REFERRAL_RULES = Object.freeze({ minMatchSec: 60, dailyCap: 20 });

/**
 * v0.2.25 (the owner: «давать алмазы за приглашение друзей по уникальной ссылке»): BLATS on top of the talons —
 * `amount` for every invited friend who has played `matches` whole online matches (the same «whole» as above),
 * paid once; at most `monthlyCap` friends a month pay BLATS (the rest still pay their talons). The server's
 * REFERRAL_BLATS, REFERRAL_BLATS_MATCHES and REFERRAL_BLATS_MONTHLY set them (0 BLATS: off).
 */
export const REFERRAL_BLATS = Object.freeze({ amount: 50, matches: 3, monthlyCap: 20 });
export type ReferralBlatsRules = { amount: number; matches: number; monthlyCap: number };

/** A referral code: the player's own (8 letters and digits) or a partner's (an author's name). */
export const REF_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
export const isRefCode = (v: unknown): v is string => typeof v === 'string' && REF_CODE_RE.test(v);

/** The founder's account: level and badge (v0.2.17). */
export const FOUNDER_LEVEL = 87;
