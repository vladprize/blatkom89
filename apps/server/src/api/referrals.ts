/**
 * Invitations (V2.0; v0.2.18: paid in talons): the player's link and what their invitations brought.
 *
 *   GET /api/referrals → ReferralResponse (also counts the player's own invitation if they have played a
 *                        whole match since — idempotent)
 *
 * Nothing here can change a balance on the client's word: credits happen in referrals/repo.ts.
 */
import type { ReferralResponse, SocialEvent } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { ReferralRepo } from '../referrals/repo.js';
import { referralBlatsRules } from '../services/persistence.js';
import type { BlatsResult, ConfirmResult } from '../referrals/repo.js';

export const registerReferralRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const byUser = (ctx: Ctx) => currentUser(ctx).userId;
  const readLimiter = new RateLimiter(60, 1);
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new ReferralRepo(deps.sql, { publicUrl: deps.env.PUBLIC_URL, botUsername: deps.env.TELEGRAM_BOT_USERNAME || null }, referralBlatsRules(deps.env));
  };

  router.get('/api/referrals', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const r = repo();
    if (await r.hasPending(me.userId)) {
      const c = await r.tryConfirm(me.userId).catch((e: Error) => {
        deps.log.warn('referral confirmation failed', { err: e });
        return null;
      });
      if (c) notifyReferral(deps.social, c);
    }
    if (await r.hasPendingBlats(me.userId)) {
      const b = await r.tryPayBlats(me.userId).catch((e: Error) => {
        deps.log.warn('referral blats failed', { err: e });
        return null;
      });
      if (b) notifyReferralBlats(deps.social, b);
    }
    const res: ReferralResponse = await r.overview(me.userId);
    ctx.json(200, res, { 'cache-control': 'no-store' });
  });
};

/** Tells the inviter that an invitation counted (or waits for a check). */
export function notifyReferral(social: { push(userId: string, e: SocialEvent): void } | null | undefined, r: ConfirmResult): void {
  if (!social) return;
  if (r.status === 'confirmed') social.push(r.paid.referrerId, { type: 'referral', name: r.paid.refereeName, reward: r.paid.reward, balance: r.paid.balance, held: false });
  else social.push(r.referrerId, { type: 'referral', name: '', reward: 0, balance: -1, held: true });
}

/** v0.2.25: tells the inviter that a friend's matches brought BLATS (a capped or held one says nothing yet). */
export function notifyReferralBlats(social: { push(userId: string, e: SocialEvent): void } | null | undefined, b: BlatsResult): void {
  if (!social || b.status !== 'paid') return;
  social.push(b.referrerId, { type: 'referral', name: b.refereeName, reward: 0, balance: -1, held: false, blats: b.amount });
}
