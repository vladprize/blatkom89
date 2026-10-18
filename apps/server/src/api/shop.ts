/**
 * Shop, wallet and loadout API (players) and payment-provider webhooks.
 * All prices and rules come from packages/shared/src/game-rules/economy.ts; the server never trusts
 * client-side ownership, balances or prices.
 */
import { BuyRequest, CaseOpenRequest, CheckoutRequest, DIAMOND_PACKS, LoadoutRequest, ModBuyRequest, MOD_PRICES, CASE_PRICE, priceOf } from '@blatkom/shared';
import type { CaseResult, Loadout, ShopConfig } from '@blatkom/shared';
import type { RouteModule } from '../app.js';
import { HttpError, readBody } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';
import { EconomyError } from '../economy/repo.js';

export const registerShopRoutes: RouteModule = (router, deps) => {
  const auth = requireUser(deps.services.sessions);
  const shopLimiter = new RateLimiter(20, 20 / 60);
  const payLimiter = new RateLimiter(6, 6 / 60);
  const hookLimiter = new RateLimiter(120, 2);
  const byUser = (ctx: Parameters<typeof currentUser>[0]) => currentUser(ctx).userId;
  const pg = () => {
    if (!deps.sql) throw new HttpError(503, 'persistence_unavailable', 'The service is temporarily unavailable');
    return pgContext(deps.sql, deps.env, deps.log);
  };
  /** Maps rule refusals to 409 with a Russian message the client can show as is. */
  const guard = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof EconomyError) throw new HttpError(409, e.refusal, e.message);
      throw e;
    }
  };

  router.get('/api/shop/config', (ctx) => {
    const p = deps.sql ? pg().payments : null;
    const res: ShopConfig = { card: !!p?.card, crypto: !!p?.crypto, casesEnabled: deps.env.CASES_ENABLED, packs: [...DIAMOND_PACKS] };
    ctx.json(200, res);
  });

  router.get('/api/me/inventory', auth, async (ctx) => {
    ctx.json(200, await pg().economy.inventory(currentUser(ctx).userId));
  });

  router.get('/api/me/ledger', auth, async (ctx) => {
    const limit = Math.min(100, Math.max(1, Number(ctx.query.get('limit') ?? 30) || 30));
    ctx.json(200, { entries: await pg().economy.ledger(currentUser(ctx).userId, limit) });
  });

  router.post('/api/shop/buy', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(BuyRequest, 1024);
    const inv = await guard(() => pg().economy.buy(user.userId, body.kind, body.id));
    const price = priceOf(body.kind, body.id);
    if (price) deps.services.analytics.server('shop_purchase', { kind: body.kind, item: body.id, currency: price.currency, amount: price.amount }, user);
    ctx.json(200, inv);
  });

  router.post('/api/shop/mod', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(ModBuyRequest, 1024);
    const inv = await guard(() => pg().economy.buyMod(user.userId, body.weapon, body.mod));
    deps.services.analytics.server('mod_bought', { weapon: body.weapon, mod: body.mod, cost: MOD_PRICES[body.mod] }, user);
    ctx.json(200, inv);
  });

  router.post('/api/shop/case', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    if (!deps.env.CASES_ENABLED) throw new HttpError(403, 'cases_disabled', 'Cases are switched off on this server');
    const user = currentUser(ctx);
    await ctx.body(CaseOpenRequest, 1024);
    const { entry, inventory } = await guard(() => pg().economy.openCase(user.userId));
    deps.services.analytics.server('case_opened', { weapon: entry.weapon, rarity: entry.rarity, price: CASE_PRICE }, user);
    const res: CaseResult = { weapon: entry.weapon, rarity: entry.rarity, inventory };
    ctx.json(200, res);
  });

  router.post('/api/me/loadout', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(LoadoutRequest, 4096);
    ctx.json(200, await pg().economy.setLoadout(user.userId, body as Pick<Loadout, 'sidearm' | 'melee' | 'primary'> & Partial<Pick<Loadout, 'gadget' | 'mods'>>));
  });

  // ── Diamonds for real money ───────────────────────────────────────────────
  router.post('/api/pay/checkout', auth, rateLimit(payLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    // Telegram requires digital goods inside Mini Apps to be sold for Telegram Stars (XTR) only
    if (user.method === 'telegram') throw new HttpError(403, 'telegram_stars_only', 'Inside Telegram, diamonds will be sold for Telegram Stars — coming soon');
    const body = await ctx.body(CheckoutRequest, 1024);
    ctx.json(200, await pg().payments.checkout(user.userId, body.packId, body.method));
  });

  router.get('/api/pay/:id', auth, async (ctx) => {
    if (!/^[0-9a-f-]{36}$/i.test(ctx.params.id ?? '')) throw new HttpError(404, 'not_found', 'Payment not found');
    ctx.json(200, await pg().payments.status(currentUser(ctx).userId, ctx.params.id!));
  });

  router.post('/api/pay/stripe/webhook', rateLimit(hookLimiter), async (ctx) => {
    const payments = pg().payments;
    if (!payments.card) throw new HttpError(404, 'not_found', 'Not found');
    const raw = await readBody(ctx.req, 256 * 1024);
    if (!payments.card.verifyWebhook(raw, ctx.req.headers['stripe-signature'] as string | undefined)) {
      deps.log.warn('stripe webhook: bad signature', { ip: ctx.ip });
      throw new HttpError(400, 'bad_signature', 'Bad signature');
    }
    let event: { type?: string; data?: { object?: Record<string, unknown> } };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new HttpError(400, 'bad_json', 'Malformed JSON');
    }
    await payments.onStripeEvent(event);
    ctx.json(200, { received: true });
  });

  router.post('/api/pay/nowpayments/ipn', rateLimit(hookLimiter), async (ctx) => {
    const payments = pg().payments;
    if (!payments.crypto) throw new HttpError(404, 'not_found', 'Not found');
    const raw = await readBody(ctx.req, 64 * 1024);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new HttpError(400, 'bad_json', 'Malformed JSON');
    }
    if (!payments.crypto.verifyIpn(body, ctx.req.headers['x-nowpayments-sig'] as string | undefined)) {
      deps.log.warn('nowpayments ipn: bad signature', { ip: ctx.ip });
      throw new HttpError(400, 'bad_signature', 'Bad signature');
    }
    await payments.onNowPaymentsIpn(body);
    ctx.json(200, { received: true });
  });
};
