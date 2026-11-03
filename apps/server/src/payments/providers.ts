/**
 * Payment providers for BLATS packs («diamonds» in the code). Only real, verified provider confirmations
 * credit BLATS:
 *   - the website: Xsolla Pay Station (v0.2.18 part 3; webhooks signed with the project's secret key), or
 *     Stripe Checkout where Xsolla isn't set up (webhook signed with STRIPE_WEBHOOK_SECRET)
 *   - inside Telegram: Telegram Stars (./stars.ts) — Telegram requires Stars for digital goods there
 * Without keys a provider is simply unavailable — there is no simulated purchase flow. v0.2.18: the crypto
 * provider (NOWPayments) is gone with the whole crypto theme. Plain HTTPS calls (no SDK dependency);
 * `fetchImpl` is injectable for tests.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { DiamondPack } from '@blatkom/shared';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface CheckoutInput {
  paymentId: string;
  pack: DiamondPack;
  successUrl: string;
  cancelUrl: string;
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
      'line_items[0][price_data][product_data][name]': `${i.pack.diamonds} BLATS — BLATKOM ’89`,
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

// ── Xsolla (v0.2.18 part 3) ─────────────────────────────────────────────────

export interface XsollaConfig {
  merchantId: string;
  projectId: string;
  apiKey: string;
  webhookSecret: string;
  sandbox: boolean;
  /** A pack's In-Game Store SKU is this + its BLATS: blats_99 … blats_4999. */
  skuPrefix: string;
}

export interface XsollaCheckoutInput {
  paymentId: string;
  pack: DiamondPack;
  userId: string;
  alias?: string;
  /** The player's IPv4 address, for Xsolla to pick the country and currency (else the country is US). */
  ip?: string;
  lang: 'ru' | 'en';
  returnUrl: string;
}

/**
 * Xsolla's In-Game Store «Create payment token for purchase» (server side, Basic auth with the merchant id
 * and the API key) and its webhooks (`Authorization: Signature <sha1(raw body + secret key)>`). The order id
 * Xsolla returns is the payment's provider_ref; `order_paid` names it.
 */
export class XsollaProvider {
  constructor(
    readonly cfg: XsollaConfig,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  sku(pack: DiamondPack): string {
    return `${this.cfg.skuPrefix}${pack.diamonds}`;
  }

  /** The pack a webhook's SKU names, by its BLATS (null: not one of ours). */
  packBlatsOfSku(sku: string): number | null {
    if (!sku.startsWith(this.cfg.skuPrefix)) return null;
    const n = Number(sku.slice(this.cfg.skuPrefix.length));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async createCheckout(i: XsollaCheckoutInput): Promise<CheckoutSession> {
    const ipv4 = i.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(i.ip) ? i.ip : undefined;
    const body = {
      user: {
        id: { value: i.userId },
        ...(i.alias ? { name: { value: i.alias.slice(0, 32) } } : {}),
        ...(ipv4 ? {} : { country: { value: 'US' } }),
      },
      purchase: { items: [{ sku: this.sku(i.pack), quantity: 1 }] },
      sandbox: this.cfg.sandbox,
      settings: { language: i.lang, return_url: i.returnUrl },
      custom_parameters: { payment_id: i.paymentId },
    };
    const res = await this.fetchImpl(`https://store.xsolla.com/api/v3/project/${this.cfg.projectId}/admin/payment/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.cfg.merchantId}:${this.cfg.apiKey}`).toString('base64')}`,
        'content-type': 'application/json',
        ...(ipv4 ? { 'x-user-ip': ipv4 } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ProviderError(`xsolla token failed: ${res.status}`);
    const data = (await res.json()) as { token?: string; order_id?: number };
    if (!data.token || typeof data.order_id !== 'number') throw new ProviderError('xsolla token: malformed response');
    const host = this.cfg.sandbox ? 'https://sandbox-secure.xsolla.com' : 'https://secure.xsolla.com';
    return { providerRef: String(data.order_id), url: `${host}/paystation4/?token=${encodeURIComponent(data.token)}` };
  }

  /** `Authorization: Signature <hex>` where hex = sha1(raw body + the project's secret key). */
  verifyWebhook(rawBody: Buffer, header: string | undefined): boolean {
    const m = /^Signature ([0-9a-f]{40})$/i.exec((header ?? '').trim());
    if (!m) return false;
    const expected = createHash('sha1').update(rawBody).update(this.cfg.webhookSecret).digest();
    const got = Buffer.from(m[1]!.toLowerCase(), 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  }
}
