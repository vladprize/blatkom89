/**
 * Shop, wallet and loadout API (players) and payment-provider webhooks (v0.2.18: BLATS for money, skins
 * one by one for BLATS, the skin case for BLATS; no crypto).
 * All prices and rules come from packages/shared/src/game-rules/economy.ts; the server never trusts
 * client-side ownership, balances or prices.
 */
import { BuyRequest, BundleBuyRequest, CaseOpenRequest, CheckoutRequest, DIAMOND_PACKS, LoadoutRequest, ModBuyRequest, MOD_PRICES, CASE_PRICE, CHARACTER_CASE_PRICE, PASS_PRICE, PassBuyRequest, PromoRedeemRequest, REAL_MONEY, SKIN_CASE_PRICE, SkinBuyRequest, StarsInvoiceRequest, bundleOf, passEnd, priceOf, skinPrice } from '@blatkom/shared';
import type { CaseResult, CharacterCaseResult, Loadout, PassBuyResult, PassClaimResult, PromoRedeemResponse, ShopConfig, ShopPrice, SkinCaseResult } from '@blatkom/shared';
import { passSeasonOf } from '../config/env.js';
import type { RouteModule } from '../app.js';
import { HttpError, readBody } from '../http/router.js';
import { requireUser, currentUser } from '../http/auth.js';
import { RateLimiter, rateLimit } from '../security/rateLimit.js';
import { pgContext } from '../services/persistence.js';
import { EconomyError } from '../economy/repo.js';
import { redeemPromo } from '../economy/bonuses.js';

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

  /** A case for real money (BLATS) needs the adult confirmation; a talon case has no money in it. */
  const adultCheck = (body: { confirmAge?: true | undefined }, price: ShopPrice) => {
    if (price.currency === 'diamonds' && body.confirmAge !== true) throw new HttpError(400, 'confirm_age', 'Confirm that you are 18 or older');
  };

  router.get('/api/shop/config', (ctx) => {
    const p = deps.sql ? pg().payments : null;
    // v0.2.18: BLATS are on sale (REAL_MONEY); the packs show whether a payment method is connected or not
    // v0.2.18 part 3: Xsolla (or Stripe) on the website, Telegram Stars inside the Mini App
    const web = REAL_MONEY ? (p?.webProvider ?? null) : null;
    const season = passSeasonOf(deps.env);
    const res: ShopConfig = {
      card: !!web,
      provider: web,
      stars: REAL_MONEY ? (p?.starsPrices() ?? null) : null,
      casesEnabled: deps.env.CASES_ENABLED,
      packs: REAL_MONEY ? [...DIAMOND_PACKS] : [],
      // v0.2.24: the Season Pass's season (null: none configured)
      pass: season ? { ...season, end: passEnd(season).toISOString() } : null,
    };
    ctx.json(200, res);
  });

  router.get('/api/me/inventory', auth, async (ctx) => {
    ctx.json(200, await pg().economy.inventory(currentUser(ctx).userId));
  });

  router.get('/api/me/ledger', auth, async (ctx) => {
    const limit = Math.min(100, Math.max(1, Number(ctx.query.get('limit') ?? 30) || 30));
    ctx.json(200, { entries: await pg().economy.ledger(currentUser(ctx).userId, limit) });
  });

  // v0.2.20: promo codes for BLATS (BLATNOY…), each once per account (economy/bonuses.ts); a few tries per
  // player and per address, so codes aren't guessed
  const promoLimiter = new RateLimiter(8, 8 / 600);
  const promoIpLimiter = new RateLimiter(30, 30 / 600);
  router.post('/api/promo', auth, rateLimit(promoIpLimiter), rateLimit(promoLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(PromoRedeemRequest, 1024);
    const r = await redeemPromo(pg().sql, user.userId, body.code);
    if (!r.ok) {
      if (r.reason === 'unknown') throw new HttpError(404, 'promo_unknown', 'There is no such promo code');
      if (r.reason === 'used') throw new HttpError(409, 'promo_used', 'This promo code has already been used on your account');
      throw new HttpError(410, 'promo_expired', 'This promo code no longer works');
    }
    deps.log.info('promo code redeemed', { code: r.code, userId: user.userId, diamonds: r.gained });
    const res: PromoRedeemResponse = { code: r.code, diamonds: r.gained, balance: r.balance };
    ctx.json(200, res);
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
    adultCheck(await ctx.body(CaseOpenRequest, 1024), CASE_PRICE);
    const { entry, inventory } = await guard(() => pg().economy.openCase(user.userId));
    deps.services.analytics.server('case_opened', { weapon: entry.weapon, rarity: entry.rarity, price: CASE_PRICE.amount, currency: CASE_PRICE.currency, kind: 'weapon' }, user);
    const res: CaseResult = { weapon: entry.weapon, rarity: entry.rarity, inventory };
    ctx.json(200, res);
  });

  /** v0.2.18 part 2 — the character case: a character sold for BLATS, not owned yet (299 BLATS, 18+). */
  router.post('/api/shop/character-case', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    if (!deps.env.CASES_ENABLED) throw new HttpError(403, 'cases_disabled', 'Cases are switched off on this server');
    const user = currentUser(ctx);
    adultCheck(await ctx.body(CaseOpenRequest, 1024), CHARACTER_CASE_PRICE);
    const { character, grade, inventory } = await guard(() => pg().economy.openCharacterCase(user.userId));
    deps.services.analytics.server('case_opened', { rarity: grade, price: CHARACTER_CASE_PRICE.amount, currency: CHARACTER_CASE_PRICE.currency, kind: 'character', character }, user);
    const res: CharacterCaseResult = { character, grade, inventory };
    ctx.json(200, res);
  });

  /** The skin case (v0.23): a weapon skin not owned yet (v0.24: for talons). */
  router.post('/api/shop/skin-case', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    if (!deps.env.CASES_ENABLED) throw new HttpError(403, 'cases_disabled', 'Cases are switched off on this server');
    const user = currentUser(ctx);
    adultCheck(await ctx.body(CaseOpenRequest, 1024), SKIN_CASE_PRICE);
    const { drop, equipped, inventory } = await guard(() => pg().economy.openSkinCase(user.userId));
    deps.services.analytics.server('case_opened', { weapon: drop.weapon, rarity: drop.rarity, price: SKIN_CASE_PRICE.amount, currency: SKIN_CASE_PRICE.currency, kind: 'skin', finish: drop.finish }, user);
    const res: SkinCaseResult = { weapon: drop.weapon, finish: drop.finish, rarity: drop.rarity, equipped, inventory };
    ctx.json(200, res);
  });

  // ── v0.2.24: the Season Pass (game-rules/pass.ts) ─────────────────────────────────────────────────────
  /** The season, whether the player has its pass, its weeks and how many are ready to open. */
  router.get('/api/pass', auth, async (ctx) => {
    ctx.json(200, await pg().economy.passState(currentUser(ctx).userId, passSeasonOf(deps.env), deps.env.CASES_ENABLED));
  });

  /** Buys the season's pass for BLATS — random items for real money's worth: 18+ and CASES_ENABLED, as the cases. */
  router.post('/api/pass/buy', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    if (!deps.env.CASES_ENABLED) throw new HttpError(403, 'cases_disabled', 'Cases are switched off on this server');
    const user = currentUser(ctx);
    adultCheck(await ctx.body(PassBuyRequest, 1024), PASS_PRICE);
    const season = passSeasonOf(deps.env);
    const inventory = await guard(() => pg().economy.buyPass(user.userId, season));
    deps.services.analytics.server('shop_purchase', { kind: 'pass', item: `pass:${season!.id}`, currency: PASS_PRICE.currency, amount: PASS_PRICE.amount }, user);
    const res: PassBuyResult = { state: await pg().economy.passState(user.userId, season, deps.env.CASES_ENABLED), inventory };
    ctx.json(200, res);
  });

  /**
   * Opens every ready week of the player's passes (drawn now). A pass already paid for keeps giving its weeks even
   * if cases are switched off later — the player has paid for them.
   */
  router.post('/api/pass/claim', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const { drops, inventory } = await guard(() => pg().economy.claimPass(user.userId));
    for (const d of drops) deps.services.analytics.server('pass_week_opened', { season: d.season, week: d.week, skinRarity: d.skin?.rarity ?? null, characterGrade: d.character?.grade ?? null, blats: d.blats }, user);
    const res: PassClaimResult = { drops, state: await pg().economy.passState(user.userId, passSeasonOf(deps.env), deps.env.CASES_ENABLED), inventory };
    ctx.json(200, res);
  });

  /** v0.2.18: one weapon's skin for BLATS (put on that weapon at once). */
  router.post('/api/shop/skin', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(SkinBuyRequest, 1024);
    const inv = await guard(() => pg().economy.buySkin(user.userId, body.weapon, body.finish));
    const price = skinPrice(body.finish);
    if (price) deps.services.analytics.server('shop_purchase', { kind: 'skin', item: `${body.weapon}.${body.finish}`, currency: price.currency, amount: price.amount }, user);
    ctx.json(200, inv);
  });

  /** v0.2.23: a set — a character with their legendary skin, cheaper than the two apart (game-rules/bundles.ts). */
  router.post('/api/shop/bundle', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(BundleBuyRequest, 1024);
    const inv = await guard(() => pg().economy.buyBundle(user.userId, body.character));
    const b = bundleOf(body.character);
    if (b) deps.services.analytics.server('shop_purchase', { kind: 'bundle', item: `${b.character}+${b.weapon}.${b.finish}`, currency: 'diamonds', amount: b.price }, user);
    ctx.json(200, inv);
  });

  router.post('/api/me/loadout', auth, rateLimit(shopLimiter, byUser), async (ctx) => {
    const user = currentUser(ctx);
    const body = await ctx.body(LoadoutRequest, 4096);
    ctx.json(200, await pg().economy.setLoadout(user.userId, body as Pick<Loadout, 'sidearm' | 'melee' | 'primary'> & Partial<Pick<Loadout, 'gadget' | 'mods' | 'skins'>>));
  });

  // ── BLATS for real money (v0.2.18) ─────────────────────────────────────────
  router.post('/api/pay/checkout', auth, rateLimit(payLimiter, byUser), async (ctx) => {
    if (!REAL_MONEY) throw new HttpError(403, 'payments_off', 'Nothing is sold for money: the game is free');
    const user = currentUser(ctx);
    // Telegram requires digital goods inside Mini Apps to be sold for Telegram Stars (XTR) only
    if (user.method === 'telegram') throw new HttpError(403, 'telegram_stars_only', 'Inside Telegram, BLATS are sold for Telegram Stars');
    const body = await ctx.body(CheckoutRequest, 1024);
    const lang = /^ru\b/i.test(String(ctx.req.headers['accept-language'] ?? '')) ? 'ru' : 'en';
    ctx.json(200, await pg().payments.checkout(user.userId, body.packId, body.method, { ip: ctx.ip, lang, alias: user.displayName }));
  });

  // v0.2.18 part 3: inside Telegram — an invoice in Telegram Stars (the Mini App opens it)
  router.post('/api/pay/stars', auth, rateLimit(payLimiter, byUser), async (ctx) => {
    if (!REAL_MONEY) throw new HttpError(403, 'payments_off', 'Nothing is sold for money: the game is free');
    const user = currentUser(ctx);
    if (user.method !== 'telegram') throw new HttpError(403, 'stars_in_telegram', 'Telegram Stars are paid inside Telegram — open the game there');
    const body = await ctx.body(StarsInvoiceRequest, 1024);
    const lang = /^ru\b/i.test(String(ctx.req.headers['accept-language'] ?? '')) ? 'ru' : 'en';
    ctx.json(200, await pg().payments.starsInvoice(user.userId, body.packId, lang));
  });

  // v0.2.18 part 3: Xsolla's webhooks (signed with the project's secret key)
  router.post('/api/pay/xsolla/webhook', rateLimit(hookLimiter), async (ctx) => {
    const payments = pg().payments;
    if (!payments.xsolla) throw new HttpError(404, 'not_found', 'Not found');
    const raw = await readBody(ctx.req, 256 * 1024);
    if (!payments.xsolla.verifyWebhook(raw, ctx.req.headers['authorization'] as string | undefined)) {
      deps.log.warn('xsolla webhook: bad signature', { ip: ctx.ip });
      return ctx.json(400, { error: { code: 'INVALID_SIGNATURE', message: 'Bad signature' } });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return ctx.json(400, { error: { code: 'INVALID_PARAMETER', message: 'Malformed JSON' } });
    }
    const r = await payments.onXsollaWebhook(body);
    if (r.status === 204) return ctx.json(204, null);
    deps.log.warn('xsolla webhook refused', { type: String(body.notification_type ?? ''), code: r.code });
    ctx.json(400, { error: { code: r.code, message: r.message } });
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
};
