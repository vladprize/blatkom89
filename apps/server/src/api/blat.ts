/**
 * $BLAT (V2.0): the player's balance, history, level rewards and referral programme.
 *
 *   GET /api/blat → BlatResponse (also pays levels reached before $BLAT existed, and counts the player's
 *                   own invitation if they have played a whole match since — both idempotent)
 *   GET /api/blat/drop → BlatDropInfo: the BLAT DROP announcement date and the server's clock (no sign-in
 *                   needed: the same answer for everyone)
 *
 * Nothing here can change a balance on the client's word: credits happen in blat/repo.ts.
 */
import type { BlatDropInfo, BlatResponse } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError } from '../http/router.js';
import type { Ctx } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { BlatRepo } from '../blat/repo.js';
import type { ConfirmResult } from '../blat/repo.js';
import { BlatDropRepo } from '../blat/drop.js';

export const registerBlatRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const byUser = (ctx: Ctx) => currentUser(ctx).userId;
  const readLimiter = new RateLimiter(60, 1);
  const dropLimiter = new RateLimiter(30, 30 / 60);
  const repo = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return new BlatRepo(deps.sql, { publicUrl: deps.env.PUBLIC_URL, botUsername: deps.env.TELEGRAM_BOT_USERNAME || null });
  };

  router.get('/api/blat', auth, rateLimit(readLimiter, byUser), async (ctx) => {
    const me = currentUser(ctx);
    const r = repo();
    if (await r.hasPending(me.userId)) {
      const c = await r.tryConfirm(me.userId).catch((e: Error) => {
        deps.log.warn('referral confirmation failed', { err: e });
        return null;
      });
      if (c) notifyReferral(deps.social, c);
    }
    const res: BlatResponse = await r.overview(me.userId);
    ctx.json(200, res, { 'cache-control': 'no-store' });
  });

  router.get('/api/blat/drop', rateLimit(dropLimiter), async (ctx) => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    const d = await new BlatDropRepo(deps.sql, deps.env.BLAT_DROP_ANNOUNCE_AT).date();
    const res: BlatDropInfo = { announceAt: d.announceAt, serverNow: new Date().toISOString() };
    ctx.json(200, res, { 'cache-control': 'no-store' });
  });
};

/** Tells the inviter that an invitation counted (or waits for a check). */
export function notifyReferral(social: { push(userId: string, e: import('@blatkom/shared').SocialEvent): void } | null | undefined, r: ConfirmResult): void {
  if (!social) return;
  if (r.status === 'confirmed') social.push(r.paid.referrerId, { type: 'referral', name: r.paid.refereeName, reward: r.paid.reward, balance: r.paid.balance, held: false });
  else social.push(r.referrerId, { type: 'referral', name: '', reward: 0, balance: -1, held: true });
}
