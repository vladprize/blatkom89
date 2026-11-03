/**
 * Telegram Stars (XTR) for BLATS packs inside the Mini App (v0.2.18 part 3). Telegram requires digital
 * goods sold in Mini Apps to be paid in Stars, so inside Telegram this is the only way to buy BLATS.
 *
 *   1. the game asks the server for an invoice (POST /api/pay/stars): a payment row and Telegram's
 *      invoice link (`createInvoiceLink`, currency XTR, one price, no provider token, the payment id as the
 *      payload); the Mini App opens it with `Telegram.WebApp.openInvoice`
 *   2. Telegram asks the bot (webhook `pre_checkout_query`) whether to go on: yes only for an open
 *      payment of this price, made by this Telegram user, at most a day old — answered within the 10 s
 *      Telegram allows, in the webhook's own response
 *   3. Telegram reports the money (`message.successful_payment`): the payment is credited exactly once,
 *      keyed by the payload and Telegram's `telegram_payment_charge_id` (kept — a refund needs it)
 *   4. a refund is made by the bot (`refundStarPayment`, the admin's «Refund Stars»); a refund Telegram
 *      reports (`message.refunded_payment`) takes back the BLATS still unspent, as for any provider
 *
 * Prices: the pack's dollar price × STARS_PER_USD, rounded to 5 Stars. Docs: docs/PAYMENTS.md.
 */
import type { DiamondPack } from '@blatkom/shared';
import { botApi } from '../telegram/botApi.js';

type Fetch = typeof fetch;

export class StarsProvider {
  constructor(
    private readonly token: string,
    private readonly starsPerUsd: number,
    private readonly fetchImpl: Fetch = fetch,
    private readonly apiBase = 'https://api.telegram.org',
  ) {}

  /** A pack's price in Stars: dollars × the rate, rounded to 5, at least 5. */
  price(pack: DiamondPack): number {
    return Math.max(5, Math.round(((pack.usdCents / 100) * this.starsPerUsd) / 5) * 5);
  }

  /** Telegram's invoice link for a payment (its id is the invoice's payload). */
  async invoiceLink(paymentId: string, pack: DiamondPack, stars: number, lang: 'ru' | 'en'): Promise<string> {
    const title = lang === 'ru' ? `${pack.diamonds} БЛАТ` : `${pack.diamonds} BLATS`;
    const description =
      lang === 'ru'
        ? `${pack.diamonds} БЛАТ на твой счёт в БЛАТКОМ ’89: персонажи, скины, кейс. Зачисляются сразу после оплаты.`
        : `${pack.diamonds} BLATS for your BLATKOM ’89 account: characters, skins, the case. Credited as soon as you pay.`;
    return botApi<string>(
      this.token,
      'createInvoiceLink',
      { title, description, payload: paymentId, provider_token: '', currency: 'XTR', prices: [{ label: title, amount: stars }] },
      this.fetchImpl,
      this.apiBase,
    );
  }

  /** Gives a Stars payment back (only the bot that was paid can). */
  async refund(telegramUserId: number, chargeId: string): Promise<void> {
    await botApi(this.token, 'refundStarPayment', { user_id: telegramUserId, telegram_payment_charge_id: chargeId }, this.fetchImpl, this.apiBase);
  }
}
