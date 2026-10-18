/**
 * Payment providers for diamond packs. Only real, verified provider confirmations credit diamonds:
 *   - card: Stripe Checkout (hosted page; webhook signed with STRIPE_WEBHOOK_SECRET)
 *   - crypto: NOWPayments invoices (hosted page; IPN signed with NOWPAYMENTS_IPN_SECRET)
 * Without keys a provider is simply unavailable — there is no simulated purchase flow.
 * Both are plain HTTPS calls (no SDK dependency); `fetchImpl` is injectable for tests.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DiamondPack } from '@blatkom/shared';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface CheckoutInput {
  paymentId: string;
  pack: DiamondPack;
  successUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

export interface CheckoutSession {
  providerRef: string;
  url: string;
}

export class ProviderError extends Error {}

// ── Stripe ─────────────────────────────────────────────────────────────────

export class StripeProvider {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  async createCheckout(i: CheckoutInput): Promise<CheckoutSession> {
    const form = new URLSearchParams({
      mode: 'payment',
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      client_reference_id: i.paymentId,
      'metadata[payment_id]': i.paymentId,
      'payment_intent_data[metadata][payment_id]': i.paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(i.pack.usdCents),
      'line_items[0][price_data][product_data][name]': `${i.pack.diamonds} diamonds — BLATKOM ’89`,
    });
    const res = await this.fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': i.paymentId },
      body: form.toString(),
    });
    if (!res.ok) throw new ProviderError(`stripe checkout failed: ${res.status}`);
    const data = (await res.json()) as { id?: string; url?: string };
    if (!data.id || !data.url) throw new ProviderError('stripe checkout: malformed response');
    return { providerRef: data.id, url: data.url };
  }

  /** Verifies the `Stripe-Signature` header (v1 HMAC-SHA256 of "t.body", 5-minute tolerance). */
  verifyWebhook(rawBody: Buffer, header: string | undefined, nowSec = Math.floor(Date.now() / 1000)): boolean {
    if (!header) return false;
    let t = 0;
    const sigs: string[] = [];
    for (const part of header.split(',')) {
      const [k, v] = part.split('=', 2);
      if (k === 't') t = Number(v);
      else if (k === 'v1' && v) sigs.push(v);
    }
    if (!t || sigs.length === 0 || Math.abs(nowSec - t) > 300) return false;
    const expected = createHmac('sha256', this.webhookSecret).update(`${t}.`).update(rawBody).digest();
    return sigs.some((s) => {
      const got = Buffer.from(s, 'hex');
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
  }
}

// ── NOWPayments ───────────────────────────────────────────────────────────

/** NOWPayments signs the IPN body with keys sorted alphabetically (recursively). */
export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export class NowPaymentsProvider {
  private readonly base: string;
  constructor(
    private readonly apiKey: string,
    private readonly ipnSecret: string,
    sandbox = false,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {
    this.base = sandbox ? 'https://api-sandbox.nowpayments.io' : 'https://api.nowpayments.io';
  }

  async createCheckout(i: CheckoutInput): Promise<CheckoutSession> {
    const res = await this.fetchImpl(`${this.base}/v1/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        price_amount: i.pack.usdCents / 100,
        price_currency: 'usd',
        order_id: i.paymentId,
        order_description: `${i.pack.diamonds} diamonds — BLATKOM 89`,
        ipn_callback_url: i.ipnUrl,
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
      }),
    });
    if (!res.ok) throw new ProviderError(`nowpayments invoice failed: ${res.status}`);
    const data = (await res.json()) as { id?: string | number; invoice_url?: string };
    if (data.id === undefined || !data.invoice_url) throw new ProviderError('nowpayments invoice: malformed response');
    return { providerRef: String(data.id), url: data.invoice_url };
  }

  /** Verifies `x-nowpayments-sig` (HMAC-SHA512 of the key-sorted JSON body). */
  verifyIpn(body: unknown, header: string | undefined): boolean {
    if (!header || !/^[0-9a-f]{128}$/i.test(header)) return false;
    const expected = createHmac('sha512', this.ipnSecret).update(JSON.stringify(sortKeysDeep(body))).digest();
    const got = Buffer.from(header, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  }
}
