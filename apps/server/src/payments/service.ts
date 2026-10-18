/**
 * Diamond top-ups: creates provider checkouts and applies verified provider notifications.
 * A payment row is credited exactly once (row lock + unique ledger ref); underpaid, failed and
 * expired payments credit nothing. See docs/ECONOMY.md («Платежи»).
 */
import { diamondPack } from '@blatkom/shared';
import type { CheckoutResponse, PaymentStatus, PaymentStatusResponse } from '@blatkom/shared';
import type { Sql } from '../database/db.js';
import type { Logger } from '../logging/logger.js';
import type { Analytics } from '../services/contracts.js';
import { HttpError } from '../http/router.js';
import type { NowPaymentsProvider, StripeProvider } from './providers.js';

type Provider = 'stripe' | 'nowpayments';

interface PaymentRow {
  id: string;
  user_id: string | null;
  provider: Provider;
  pack_id: string;
  diamonds: number;
  amount_cents: number;
  status: PaymentStatus;
}

export class PaymentService {
  constructor(
    private readonly sql: Sql,
    private readonly log: Logger,
    private readonly analytics: Analytics,
    private readonly publicUrl: string,
    readonly card: StripeProvider | null,
    readonly crypto: NowPaymentsProvider | null,
  ) {}

  async checkout(userId: string, packId: string, method: 'card' | 'crypto'): Promise<CheckoutResponse> {
    const pack = diamondPack(packId);
    if (!pack) throw new HttpError(400, 'bad_pack', 'No such diamond pack');
    const provider = method === 'card' ? this.card : this.crypto;
    if (!provider) throw new HttpError(503, 'payments_not_configured', method === 'card' ? 'Card payments aren’t connected yet' : 'Crypto payments aren’t connected yet');
    const providerName: Provider = method === 'card' ? 'stripe' : 'nowpayments';
    const [row] = await this.sql<Array<{ id: string }>>`
      INSERT INTO payments (user_id, provider, pack_id, diamonds, amount_cents, status)
      VALUES (${userId}, ${providerName}, ${pack.id}, ${pack.diamonds}, ${pack.usdCents}, 'created') RETURNING id`;
    const id = row!.id;
    const base = this.publicUrl.replace(/\/$/, '');
    try {
      const s = await provider.createCheckout({
        paymentId: id,
        pack,
        successUrl: `${base}/?pay=success&pid=${id}`,
        cancelUrl: `${base}/?pay=cancel&pid=${id}`,
        ipnUrl: `${base}/api/pay/nowpayments/ipn`,
      });
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
   * Marks a payment paid and credits its diamonds exactly once. `paidCents` (when the provider
   * reports it) must cover the price. Returns true when diamonds were credited by this call.
   */
  async markPaid(paymentId: string, provider: Provider, paidCents?: number): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return false;
    return this.sql.begin(async (tx) => {
      const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const p = rows[0];
      if (!p || p.provider !== provider || !p.user_id) return false;
      if (p.status === 'paid' || p.status === 'refunded') return false;
      if (paidCents !== undefined && paidCents + 1 < p.amount_cents) {
        this.log.warn('underpaid payment ignored', { paymentId, paidCents, expected: p.amount_cents });
        return false;
      }
      await tx`UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = ${paymentId}`;
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
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return;
    await this.sql`UPDATE payments SET status = ${status}, updated_at = now() WHERE id = ${paymentId} AND provider = ${provider} AND status = 'created'`;
  }

  /** Refund reported by the provider: takes back the diamonds that are still unspent. */
  async markRefunded(paymentId: string, provider: Provider): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return;
    await this.sql.begin(async (tx) => {
      const rows = await tx<PaymentRow[]>`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`;
      const p = rows[0];
      if (!p || p.provider !== provider || p.status !== 'paid' || !p.user_id) return;
      await tx`UPDATE payments SET status = 'refunded', updated_at = now() WHERE id = ${paymentId}`;
      const [w] = await tx<Array<{ diamonds: number }>>`SELECT diamonds FROM profiles WHERE user_id = ${p.user_id} FOR UPDATE`;
      const take = Math.min(w?.diamonds ?? 0, p.diamonds);
      if (take > 0) {
        const after = w!.diamonds - take;
        await tx`UPDATE profiles SET diamonds = ${after}, updated_at = now() WHERE user_id = ${p.user_id}`;
        await tx`INSERT INTO currency_ledger (user_id, currency, delta, balance_after, reason, ref) VALUES (${p.user_id}, 'diamonds', ${-take}, ${after}, 'refund', ${paymentId})`;
      }
      this.log.warn('payment refunded', { paymentId, provider, takenBack: take, userId: p.user_id });
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
        if (o.payment_status === 'paid' && String(o.currency ?? 'usd').toLowerCase() === 'usd') await this.markPaid(pid, 'stripe', typeof o.amount_total === 'number' ? o.amount_total : undefined);
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

  /** NOWPayments IPN (signature already verified). */
  async onNowPaymentsIpn(body: Record<string, unknown>): Promise<void> {
    const pid = String(body.order_id ?? '');
    const status = String(body.payment_status ?? '');
    if (status === 'finished') {
      // price_amount is in the invoice currency (USD) — the full price must have been requested
      const priceUsd = Number(body.price_amount);
      await this.markPaid(pid, 'nowpayments', Number.isFinite(priceUsd) ? Math.round(priceUsd * 100) : undefined);
    } else if (status === 'failed') await this.markClosed(pid, 'nowpayments', 'failed');
    else if (status === 'expired') await this.markClosed(pid, 'nowpayments', 'expired');
    else if (status === 'refunded') await this.markRefunded(pid, 'nowpayments');
  }
}
