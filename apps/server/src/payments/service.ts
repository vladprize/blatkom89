/**
 * BLATS top-ups («diamonds» in the code): creates provider checkouts and applies verified provider notifications.
 * A payment row is credited exactly once (row lock + unique ledger ref); underpaid, failed and
 * expired payments credit nothing. See docs/ECONOMY.md («Платежи») and docs/PAYMENTS.md.
 *
 * v0.2.18 part 3: the website pays through Xsolla (when its keys are set; Stripe otherwise), Telegram's Mini
 * App through Telegram Stars (XTR) — the only way Telegram allows digital goods to be sold there.
 */
import { DIAMOND_PACKS, diamondPack } from '@blatkom/shared';
import type { CheckoutResponse, PaymentStatus, PaymentStatusResponse, StarsInvoiceResponse } from '@blatkom/shared';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { Analytics } from '../services/contracts.js';
import { HttpError } from '../http/router.js';
import type { StripeProvider, XsollaProvider } from './providers.js';
import type { StarsProvider } from './stars.js';

export type Provider = 'stripe' | 'xsolla' | 'telegram';

interface PaymentRow {
  id: string;
  user_id: string | null;
  provider: Provider;
  provider_ref: string | null;
  pack_id: string;
  diamonds: number;
  amount_cents: number;
  status: PaymentStatus;
  stars: number | null;
  charge_ref: string | null;
  created_at: Date;
}

/** What the website's checkout knows about the player (Xsolla wants the language and, for the currency, the IP). */
export interface CheckoutContext {
  ip?: string;
  lang?: 'ru' | 'en';
  alias?: string;
}

/** Telegram's `pre_checkout_query` (the part the game reads). */
export interface StarsPreCheckout {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

/** Telegram's `successful_payment` / `refunded_payment`. */
export interface StarsCharge {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

/** How long an unpaid Stars invoice may still be paid. */
const STARS_INVOICE_TTL_MS = 24 * 3600_000;
const UUID = /^[0-9a-f-]{36}$/i;

export class PaymentService {
  readonly xsolla: XsollaProvider | null;
  readonly stars: StarsProvider | null;

  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
    private readonly analytics: Analytics,
    private readonly publicUrl: string,
    readonly card: StripeProvider | null,
    more: { xsolla?: XsollaProvider | null; stars?: StarsProvider | null } = {},
  ) {
    this.xsolla = more.xsolla ?? null;
    this.stars = more.stars ?? null;
  }

  /** Who takes the website's payments: Xsolla when it is set up, else Stripe, else nobody yet. */
  get webProvider(): 'xsolla' | 'stripe' | null {
    return this.xsolla ? 'xsolla' : this.card ? 'stripe' : null;
  }

  /** Each pack's price in Stars (null: Stars are not on sale here). */
  starsPrices(): Record<string, number> | null {
    if (!this.stars) return null;
    return Object.fromEntries(DIAMOND_PACKS.map((p) => [p.id, this.stars!.price(p)]));
  }

  async checkout(userId: string, packId: string, _method: 'card', c: CheckoutContext = {}): Promise<CheckoutResponse> {
    const pack = diamondPack(packId);
    if (!pack) throw new HttpError(400, 'bad_pack', 'No such BLATS pack');
    const providerName = this.webProvider;
    if (!providerName) throw new HttpError(503, 'payments_not_configured', 'Payments are being connected — coming soon');
    const [row] = await this.sql<Array<{ id: string }>>`
      INSERT INTO payments (user_id, provider, pack_id, diamonds, amount_cents, status)
      VALUES (${userId}, ${providerName}, ${pack.id}, ${pack.diamonds}, ${pack.usdCents}, 'created') RETURNING id`;
    const id = row!.id;
    const base = this.publicUrl.replace(/\/$/, '');
    try {
      const s =
        providerName === 'xsolla'
          ? await this.xsolla!.createCheckout({ paymentId: id, pack, userId, lang: c.lang ?? 'en', returnUrl: `${base}/?pay=success&pid=${id}`, ...(c.ip ? { ip: c.ip } : {}), ...(c.alias ? { alias: c.alias } : {}) })
          : await this.card!.createCheckout({ paymentId: id, pack, successUrl: `${base}/?pay=success&pid=${id}`, cancelUrl: `${base}/?pay=cancel&pid=${id}` });
      await this.sql`UPDATE payments SET provider_ref = ${s.providerRef}, updated_at = now() WHERE id = ${id}`;
      this.log.info('checkout created', { paymentId: id, provider: providerName, pack: pack.id, userId });
      return { paymentId: id, url: s.url };
    } catch (e) {
      await this.sql`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = ${id}`;
      this.log.error('checkout failed', { paymentId: id, provider: providerName, err: e as Error });
      throw new HttpError(502, 'payment_provider_error', 'The payment system didn’t answer — try again later');
    }
  }

  async status(userId: string, paymentId: string): Promise<PaymentStatusResponse> {
    const rows = await this.sql<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId} AND user_id = ${userId}`;
    if (!rows[0]) throw new HttpError(404, 'not_found', 'Payment not found');
    return { status: rows[0].status, diamonds: rows[0].diamonds };
  }

  /**
   * Marks a payment paid and credits its diamonds exactly once. `paid` (when the provider reports it) must
   * cover the price — US cents, or Stars for a Stars payment; `chargeRef` is the provider's id of the money
   * (Telegram's charge id). Returns true when diamonds were credited by this call.
   */
  async markPaid(paymentId: string, provider: Provider, paid?: { cents?: number; stars?: number; chargeRef?: string }): Promise<boolean> {
    if (!UUID.test(paymentId)) return false;
    return this.sql.begin(async (tx) => {
      const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const p = rows[0];
      if (!p || p.provider !== provider || !p.user_id) return false;
      if (p.status === 'paid' || p.status === 'refunded') return false;
      if (paid?.cents !== undefined && paid.cents + 1 < p.amount_cents) {
        this.log.warn('underpaid payment ignored', { paymentId, paidCents: paid.cents, expected: p.amount_cents });
        return false;
      }
      if (provider === 'telegram' && (paid?.stars === undefined || p.stars === null || paid.stars < p.stars)) {
        this.log.warn('underpaid Stars payment ignored', { paymentId, paidStars: paid?.stars, expected: p.stars });
        return false;
      }
      await tx`UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now(), charge_ref = COALESCE(${paid?.chargeRef ?? null}, charge_ref) WHERE id = ${paymentId}`;
      await tx`INSERT INTO profiles (user_id) VALUES (${p.user_id}) ON CONFLICT DO NOTHING`;
      const [w] = await tx<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${p.user_id} FOR UPDATE`;
      const after = w!.diamonds + p.diamonds;
      await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${p.user_id}`;
      await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${p.user_id}, 'diamonds', ${p.diamonds}, ${after}, 'topup', ${paymentId})`;
      this.log.info('payment credited', { paymentId, provider, diamonds: p.diamonds, userId: p.user_id });
      this.analytics.server('payment_completed', { provider, packId: p.pack_id, diamonds: p.diamonds, amountCents: p.amount_cents }, { userId: p.user_id });
      return true;
    });
  }

  async markClosed(paymentId: string, provider: Provider, status: 'failed' | 'expired'): Promise<void> {
    if (!UUID.test(paymentId)) return;
    await this.sql`UPDATE payments SET status = ${status}, updated_at = now() WHERE id = ${paymentId} AND provider = ${provider} AND status = 'created'`;
  }

  /** Refund reported by the provider: takes back the diamonds that are still unspent. */
  async markRefunded(paymentId: string, provider: Provider): Promise<boolean> {
    if (!UUID.test(paymentId)) return false;
    return this.sql.begin(async (tx) => {
      const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const p = rows[0];
      if (!p || p.provider !== provider || p.status !== 'paid' || !p.user_id) return false;
      await tx`UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = ${paymentId}`;
      const [w] = await tx<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${p.user_id} FOR UPDATE`;
      const take = Math.min(w?.diamonds ?? 0, p.diamonds);
      if (take > 0) {
        const after = w!.diamonds - take;
        await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${p.user_id}`;
        await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${p.user_id}, 'diamonds', ${-take}, ${after}, 'refund', ${paymentId})`;
      }
      this.log.warn('payment refunded', { paymentId, provider, takenBack: take, userId: p.user_id });
      return true;
    });
  }

  /** Stripe webhook (signature already verified). */
  async onStripeEvent(event: { type?: string; data?: { object?: Record<string, unknown> } }): Promise<void> {
    const o = event.data?.object ?? {};
    const meta = (o.metadata ?? {}) as Record<string, unknown>;
    const pid = String(meta.payment_id ?? o.client_reference_id ?? '');
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (o.payment_status === 'paid' && String(o.currency ?? 'usd').toLowerCase() === 'usd') await this.markPaid(pid, 'stripe', typeof o.amount_total === 'number' ? { cents: o.amount_total } : undefined);
        return;
      case 'checkout.session.async_payment_failed':
        await this.markClosed(pid, 'stripe', 'failed');
        return;
      case 'checkout.session.expired':
        await this.markClosed(pid, 'stripe', 'expired');
        return;
      case 'charge.refunded':
        if (pid) await this.markRefunded(pid, 'stripe');
        return;
      default:
        return;
    }
  }

  // ── Xsolla (v0.2.18 part 3) ───────────────────────────────────────────────

  /**
   * An Xsolla webhook (signature already verified). Returns the HTTP answer Xsolla expects: 204 when done
   * (or for a type the game doesn't need), 400 with Xsolla's error code otherwise.
   *   user_validation — the player exists; order_paid — credit the order's payment once (its id is our
   *   provider_ref; the SKU and the player must match it); order_canceled — a refund or a cancelled order:
   *   the unspent BLATS are taken back, an unpaid one is closed; payment / refund (older accounts send
   *   them besides) — acknowledged, the order webhooks do the work.
   */
  async onXsollaWebhook(body: Record<string, unknown>): Promise<{ status: 204 } | { status: 400; code: string; message: string }> {
    const x = this.xsolla;
    if (!x) return { status: 400, code: 'INVALID_PARAMETER', message: 'Xsolla is not set up' };
    const type = String(body.notification_type ?? '');
    const user = (body.user ?? {}) as Record<string, unknown>;
    if (type === 'user_validation') {
      const uid = String((user.id as string | undefined) ?? (user.external_id as string | undefined) ?? '');
      if (!UUID.test(uid)) return { status: 400, code: 'INVALID_USER', message: 'Unknown player' };
      const [u] = await this.sql<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${uid} AND deleted_at IS NULL`;
      return u ? { status: 204 } : { status: 400, code: 'INVALID_USER', message: 'Unknown player' };
    }
    if (type !== 'order_paid' && type !== 'order_canceled') return { status: 204 };
    const order = (body.order ?? {}) as Record<string, unknown>;
    const orderId = order.id === undefined || order.id === null ? '' : String(order.id);
    if (!/^\d{1,20}$/.test(orderId)) return { status: 400, code: 'INVALID_PARAMETER', message: 'No order id' };
    const [p] = await this.sql<PaymentRow[]>`SELECT * FROM payments WHERE provider = 'xsolla' AND provider_ref = ${orderId}`;
    if (!p) return { status: 400, code: 'INCORRECT_INVOICE', message: 'Unknown order' };
    if (type === 'order_canceled') {
      if (p.status === 'paid') await this.markRefunded(p.id, 'xsolla');
      else await this.markClosed(p.id, 'xsolla', 'failed');
      return { status: 204 };
    }
    // order_paid: the sandbox only while the server is in sandbox mode, the player and the pack must match
    if (order.mode === 'sandbox' && !x.cfg.sandbox) return { status: 400, code: 'INVALID_PARAMETER', message: 'A sandbox order on the live server' };
    if (String(user.external_id ?? '') !== p.user_id) return { status: 400, code: 'INVALID_USER', message: 'The order belongs to another player' };
    const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    const ours = items.find((i) => x.packBlatsOfSku(String(i.sku ?? '')) === p.diamonds && Number(i.quantity ?? 1) === 1);
    if (!ours) return { status: 400, code: 'INCORRECT_AMOUNT', message: 'The order’s item is not this pack' };
    await this.markPaid(p.id, 'xsolla');
    return { status: 204 };
  }

  // ── Telegram Stars (v0.2.18 part 3) ───────────────────────────────────────

  /**
   * An invoice for a pack: a payment row and Telegram's link to pay it in Stars. The row's amount is in
   * the payment's own currency — Stars (XTR has no smaller unit), not dollars.
   */
  async starsInvoice(userId: string, packId: string, lang: 'ru' | 'en'): Promise<StarsInvoiceResponse> {
    const pack = diamondPack(packId);
    if (!pack) throw new HttpError(400, 'bad_pack', 'No such BLATS pack');
    const stars = this.stars;
    if (!stars) throw new HttpError(503, 'payments_not_configured', 'Payments are being connected — coming soon');
    const price = stars.price(pack);
    const [row] = await this.sql<Array<{ id: string }>>`
      INSERT INTO payments (user_id, provider, pack_id, diamonds, amount_cents, currency, status, stars)
      VALUES (${userId}, 'telegram', ${pack.id}, ${pack.diamonds}, ${price}, 'xtr', 'created', ${price}) RETURNING id`;
    const id = row!.id;
    try {
      const link = await stars.invoiceLink(id, pack, price, lang);
      await this.sql`UPDATE payments SET provider_ref = ${id}, updated_at = now() WHERE id = ${id}`;
      this.log.info('stars invoice created', { paymentId: id, pack: pack.id, stars: price, userId });
      return { paymentId: id, invoiceUrl: link, stars: price };
    } catch (e) {
      await this.sql`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = ${id}`;
      this.log.error('stars invoice failed', { paymentId: id, err: e as Error });
      throw new HttpError(502, 'payment_provider_error', 'The payment system didn’t answer — try again later');
    }
  }

  /** Telegram asks whether to take the money: only for an open payment of this price, by its own player. */
  async starsPreCheckout(q: StarsPreCheckout, lang: 'ru' | 'en'): Promise<{ ok: true } | { ok: false; error: string }> {
    const no = (ru: string, en: string) => ({ ok: false as const, error: lang === 'ru' ? ru : en });
    if (!this.stars || q.currency !== 'XTR' || !UUID.test(q.invoice_payload)) return no('Этот счёт не от БЛАТКОМ ’89.', 'This invoice is not from BLATKOM ’89.');
    const rows = await this.sql<Array<PaymentRow & { telegram_id: string | null }>>`
      SELECT p.*, u.telegram_id::text AS telegram_id FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ${q.invoice_payload}`;
    const p = rows[0];
    if (!p || p.provider !== 'telegram' || !p.user_id) return no('Этот счёт не от БЛАТКОМ ’89.', 'This invoice is not from BLATKOM ’89.');
    if (p.status !== 'created') return no('Этот счёт уже оплачен или закрыт — открой магазин заново.', 'This invoice is already paid or closed — open the shop again.');
    if (Date.now() - new Date(p.created_at).getTime() > STARS_INVOICE_TTL_MS) return no('Счёт устарел — открой магазин заново.', 'The invoice has expired — open the shop again.');
    if (p.stars === null || q.total_amount !== p.stars) return no('Цена изменилась — открой магазин заново.', 'The price has changed — open the shop again.');
    if (p.telegram_id !== null && p.telegram_id !== String(q.from.id)) return no('Этот счёт выписан другому игроку.', 'This invoice was made out to another player.');
    return { ok: true };
  }

  /** Telegram reports the Stars: the payment is credited once. Returns the BLATS credited by this call (0: nothing). */
  async starsPaid(c: StarsCharge): Promise<number> {
    if (c.currency !== 'XTR' || !UUID.test(c.invoice_payload) || !c.telegram_payment_charge_id) return 0;
    const ok = await this.markPaid(c.invoice_payload, 'telegram', { stars: c.total_amount, chargeRef: c.telegram_payment_charge_id.slice(0, 200) });
    if (!ok) return 0;
    const [p] = await this.sql<Array<{ diamonds: number }>>`SELECT diamonds FROM payments WHERE id = ${c.invoice_payload}`;
    return p?.diamonds ?? 0;
  }

  /** A refund Telegram reports (made by this bot or not): the unspent BLATS are taken back. */
  async starsRefunded(c: StarsCharge): Promise<void> {
    if (!UUID.test(c.invoice_payload)) return;
    await this.markRefunded(c.invoice_payload, 'telegram');
  }

  /** The admin's «Refund Stars»: Telegram gives the Stars back, then the unspent BLATS are taken back. */
  async refundStars(paymentId: string): Promise<{ refunded: boolean }> {
    // the admin dashboard's action: its messages are in Russian, like the dashboard
    if (!this.stars) throw new HttpError(503, 'payments_not_configured', 'Звёзды Telegram не подключены');
    if (!UUID.test(paymentId)) throw new HttpError(404, 'not_found', 'Платёж не найден');
    const rows = await this.sql<Array<PaymentRow & { telegram_id: string | null }>>`
      SELECT p.*, u.telegram_id::text AS telegram_id FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ${paymentId}`;
    const p = rows[0];
    if (!p) throw new HttpError(404, 'not_found', 'Платёж не найден');
    if (p.provider !== 'telegram') throw new HttpError(409, 'not_stars', 'Здесь возвращаются только звёзды — остальные платежи в кабинете платёжной системы');
    if (p.status !== 'paid' || !p.charge_ref) throw new HttpError(409, 'not_paid', 'Платёж не оплачен');
    if (!p.telegram_id) throw new HttpError(409, 'no_telegram', 'У игрока больше нет Telegram');
    try {
      await this.stars.refund(Number(p.telegram_id), p.charge_ref);
    } catch (e) {
      this.log.error('stars refund failed', { paymentId, err: e as Error });
      throw new HttpError(502, 'payment_provider_error', `Telegram не принял возврат: ${(e as Error).message}`.slice(0, 200));
    }
    return { refunded: await this.markRefunded(paymentId, 'telegram') };
  }
}
