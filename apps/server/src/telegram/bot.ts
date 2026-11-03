/**
 * The Telegram bot (v0.3) — the simplest possible: /start (or any message) answers with the game's link.
 *
 * It answers through the webhook, so the answer can only go out once this server is running: on a free
 * host that sleeps (Render), Telegram's call to the webhook is what wakes it, and the link in the answer
 * opens a server that is already up. After an answer the server keeps itself awake for a while
 * (`BOT_WARM_MINUTES`, ../services/keepAwake.ts) so the link is still warm when the player taps it.
 *
 * - `POST /api/telegram/webhook` — Telegram's calls, checked against the secret header Telegram sends
 *   (derived from the bot token, never stored); the reply rides in the webhook's own response
 *   (`{"method":"sendMessage",…}`), so answering needs no outgoing request.
 * - `/start <room code>` (a `t.me/<bot>?start=<code>` invitation) answers with a «join the room» button.
 * - `/start link_<code>` (V2.0 part E, the website's «Link Telegram») answers with a Mini App button that
 *   opens the game with `?tglink=<code>`: Telegram is attached to the website's account.
 * - `/start p_<code>` (V2.0 part F, a partner's link) opens the game with `?p=<code>` (measured, never paid).
 * - On start-up (`setupBot`) the webhook, the command list, the menu button and the bot's descriptions
 *   are registered with the Bot API once per webhook address (the address carries a settings version,
 *   so a release that changes the texts registers them again).
 *
 * Docs: docs/TELEGRAM.md §1.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { RouteModule } from '../app.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';
import { HttpError } from '../http/router.js';
import { RateLimiter } from '../security/rateLimit.js';
import { botApi } from './botApi.js';
import { pgContext } from '../services/persistence.js';

/**
 * Bumped whenever the commands, menu button, descriptions or the updates the bot asks for change: the
 * webhook address changes with it. v2 (v0.2.18 part 3): Telegram Stars — `pre_checkout_query` updates and
 * the /paysupport and /terms commands Telegram requires of a bot that sells digital goods.
 */
export const BOT_SETTINGS_VERSION = 2;

type Lang = 'ru' | 'en';
/** Russian for the same Telegram languages as the game itself (apps/web/src/i18n). */
const RU_CODES = new Set(['ru', 'be', 'kk', 'ky']);
const langOf = (code: string | undefined): Lang => (code && RU_CODES.has(code.toLowerCase().split('-')[0]!) ? 'ru' : 'en');

/** Room codes as the game makes them (and as Telegram allows in `start`): letters, digits, `_`, `-`. */
const CODE = /^[A-Za-z0-9_-]{4,32}$/;

const TEXT = {
  ru: {
    hello: '<b>БЛАТКОМ ’89</b> на связи — сервер прогрет, заходи.\nРайонные дела — серьёзные дела.',
    invite: (code: string) => `<b>БЛАТКОМ ’89</b>: тебя зовут в комнату <code>${code}</code>.\nСервер прогрет — заходи.`,
    invited: '<b>БЛАТКОМ ’89</b>: тебя позвали в район. Сервер прогрет — заходи.\nРайонные дела — серьёзные дела.',
    link: '<b>БЛАТКОМ ’89</b>: привязка Telegram к твоему аккаунту с сайта.\nЖми кнопку — игра откроется здесь, в Telegram, с твоим прогрессом. Ссылка одноразовая и действует 10 минут.',
    linkButton: '🔗 Привязать и играть',
    play: '🎮 Играть в Telegram',
    join: '🎮 Войти в комнату',
    browser: '🌐 Открыть в браузере',
    groups: 'Открыть игру',
    commands: [
      { command: 'start', description: 'Ссылка на игру' },
      { command: 'play', description: 'Играть в БЛАТКОМ ’89' },
      { command: 'paysupport', description: 'Помощь с оплатой' },
      { command: 'terms', description: 'Условия покупки' },
    ],
    paysupport: (contact: string) =>
      `<b>Помощь с оплатой</b>\nПроблема с покупкой БЛАТ за звёзды? Напиши: ${contact} — укажи дату, сумму в звёздах и свой ник в игре. Мы отвечаем и, если что-то пошло не так, вернём звёзды.\nПоддержка Telegram и других ботов не может помочь с покупками в этом боте.`,
    terms: (url: string) => `<b>Условия покупки</b>\nБЛАТ — игровая валюта БЛАТКОМ ’89: персонажи, скины, кейс. Они не деньги, не выводятся и не обмениваются. Перед оплатой прочитай условия: ${url}`,
    paid: (n: number) => `✅ <b>+${n} БЛАТ</b> зачислено. Спасибо! Загляни в Арсенал.`,
    refunded: 'Звёзды за покупку возвращены; неизрасходованные БЛАТ списаны.',
    short: 'Районные дела — серьёзные дела. Бесплатный сетевой шутер с видом сверху.',
    description: 'БЛАТКОМ ’89 — бесплатный сетевой шутер с видом сверху про районные разборки 1989 года. Жми «Старт» — бот разбудит сервер и пришлёт ссылку на игру. Ничего устанавливать не нужно.',
  },
  en: {
    hello: '<b>BLATKOM ’89</b> is on the line — the server is warmed up, come on in.\nDistrict business is serious business.',
    invite: (code: string) => `<b>BLATKOM ’89</b>: you’re invited to room <code>${code}</code>.\nThe server is warmed up — come on in.`,
    invited: '<b>BLATKOM ’89</b>: someone called you into the district. The server is warmed up — come on in.\nDistrict business is serious business.',
    link: '<b>BLATKOM ’89</b>: linking Telegram to your account from the website.\nPress the button — the game opens here, in Telegram, with your progress. The link works once, for 10 minutes.',
    linkButton: '🔗 Link and play',
    play: '🎮 Play in Telegram',
    join: '🎮 Join the room',
    browser: '🌐 Open in the browser',
    groups: 'Open the game',
    commands: [
      { command: 'start', description: 'Get the game link' },
      { command: 'play', description: 'Play BLATKOM ’89' },
      { command: 'paysupport', description: 'Help with a payment' },
      { command: 'terms', description: 'Terms of purchase' },
    ],
    paysupport: (contact: string) =>
      `<b>Help with a payment</b>\nA problem with BLATS bought for Stars? Write to ${contact} with the date, the amount in Stars and your in-game alias. We answer and, if something went wrong, give the Stars back.\nTelegram support and other bots cannot help with purchases made in this bot.`,
    terms: (url: string) => `<b>Terms of purchase</b>\nBLATS are BLATKOM ’89’s in-game currency: characters, skins, the case. They are not money, cannot be withdrawn or exchanged. Read the terms before you pay: ${url}`,
    paid: (n: number) => `✅ <b>+${n} BLATS</b> credited. Thank you! Have a look at the Arsenal.`,
    refunded: 'The Stars for the purchase were given back; the unspent BLATS were taken back.',
    short: 'District business is serious business. A free online top-down shooter.',
    description: 'BLATKOM ’89 is a free online top-down shooter about neighbourhood turf wars in 1989. Press Start: the bot wakes the server and sends you the game link. Nothing to install.',
  },
} as const;

/** The secret Telegram repeats in `X-Telegram-Bot-Api-Secret-Token` (allowed characters: A-Z a-z 0-9 _ -). */
export function webhookSecret(botToken: string): string {
  return createHmac('sha256', botToken).update('blatkom89 telegram webhook').digest('base64url');
}

export function webhookUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook?v=${BOT_SETTINGS_VERSION}`;
}

/** The bot is switched on by a token and an https address (Telegram calls webhooks over https only). */
export function botEnabled(env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'PUBLIC_URL' | 'NODE_ENV'>): boolean {
  return !!env.TELEGRAM_BOT_TOKEN && env.PUBLIC_URL.startsWith('https://') && env.NODE_ENV !== 'test';
}

/** Telegram's SuccessfulPayment / RefundedPayment: the part the game reads (Stars, v0.2.18 part 3). */
const Charge = z
  .object({ currency: z.string().max(8), total_amount: z.number().int(), invoice_payload: z.string().max(128), telegram_payment_charge_id: z.string().max(200) })
  .passthrough();

/** The part of a Telegram update the bot reads; everything else is let through untouched. */
const Update = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        text: z.string().max(4096).optional(),
        chat: z.object({ id: z.number().int(), type: z.string() }).passthrough(),
        from: z.object({ id: z.number().int(), is_bot: z.boolean().optional(), language_code: z.string().max(35).optional() }).passthrough().optional(),
        successful_payment: Charge.optional(),
        refunded_payment: Charge.optional(),
      })
      .passthrough()
      .optional(),
    pre_checkout_query: z
      .object({
        id: z.string().max(100),
        from: z.object({ id: z.number().int(), language_code: z.string().max(35).optional() }).passthrough(),
        currency: z.string().max(8),
        total_amount: z.number().int(),
        invoice_payload: z.string().max(128),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type TelegramUpdate = z.infer<typeof Update>;

export interface BotAnswer {
  method: 'sendMessage';
  chat_id: number;
  text: string;
  parse_mode: 'HTML';
  link_preview_options: { is_disabled: true };
  reply_markup: { inline_keyboard: { text: string; url?: string; web_app?: { url: string } }[][] };
}

/** A plain text answer (no buttons). */
export type BotText = Omit<BotAnswer, 'reply_markup'>;

/** The bot's answer to a payment question (Stars), carried in the webhook's own response. */
export interface PreCheckoutAnswer {
  method: 'answerPreCheckoutQuery';
  pre_checkout_query_id: string;
  ok: boolean;
  error_message?: string;
}

/** The text commands Telegram requires of a bot that sells digital goods (v0.2.18 part 3). */
export function payCommandAnswer(update: TelegramUpdate, publicUrl: string, support: string | undefined, botUsername?: string): BotText | null {
  const m = update.message;
  if (!m || m.from?.is_bot) return null;
  const cmd = /^\/(paysupport|terms|support)(?:@([A-Za-z0-9_]+))?\b/i.exec((m.text ?? '').trim());
  if (!cmd) return null;
  if (cmd[2] && botUsername && cmd[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  const lang = langOf(m.from?.language_code);
  const T = TEXT[lang];
  const base = publicUrl.replace(/\/$/, '');
  const termsUrl = `${base}/${lang === 'ru' ? 'terms-ru.html' : 'terms.html'}`;
  const contact = support?.trim() || (lang === 'ru' ? `контакт на странице ${termsUrl}` : `the contact on ${termsUrl}`);
  const text = cmd[1]!.toLowerCase() === 'terms' ? T.terms(termsUrl) : T.paysupport(escapeHtml(contact));
  return { method: 'sendMessage', chat_id: m.chat.id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What the bot answers to an update — `null` for nothing. Private chats get the Mini App button (Telegram
 * allows it there only) and the browser link; groups answer only to /start and /play, with a link.
 */
export function botAnswer(update: TelegramUpdate, publicUrl: string, botUsername?: string): BotAnswer | null {
  const m = update.message;
  if (!m || m.from?.is_bot) return null;
  const text = (m.text ?? '').trim();
  const cmd = /^\/(start|play)(?:@([A-Za-z0-9_]+))?(?:\s+(\S+))?/i.exec(text);
  const isPrivate = m.chat.type === 'private';
  if (!isPrivate) {
    // in a group: only commands, and only those meant for this bot
    if (!cmd || (cmd[2] && botUsername && cmd[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  }
  const lang = langOf(m.from?.language_code);
  const T = TEXT[lang];
  const base = publicUrl.replace(/\/$/, '');
  // V2.0 part E: `/start link_<code>` attaches Telegram to the website's account — in a private chat
  // only, and only through the Mini App button (the game signs in with Telegram's signed data there)
  const link = isPrivate && cmd?.[3] && /^link_[A-Za-z0-9_-]{16,32}$/.test(cmd[3]) ? cmd[3].slice(5) : null;
  if (link) {
    return {
      method: 'sendMessage',
      chat_id: m.chat.id,
      text: T.link,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: T.linkButton, web_app: { url: `${base}/?tglink=${encodeURIComponent(link)}` } }]] },
    };
  }
  // V2.0: `/start ref_<code>` is a referral link (the game opens with ?ref=), part F: `/start p_<code>` a
  // partner's link (?p=, measured only); anything else is a room
  const ref = cmd?.[3] && /^ref_[A-Za-z0-9_-]{4,32}$/.test(cmd[3]) ? cmd[3].slice(4) : null;
  const partner = cmd?.[3] && /^p_[A-Za-z0-9_]{3,24}$/.test(cmd[3]) ? cmd[3].slice(2).toLowerCase() : null;
  const code = !ref && !partner && !/^(link|p)_/.test(cmd?.[3] ?? '') && cmd?.[3] && CODE.test(cmd[3]) ? cmd[3] : null;
  const url = ref ? `${base}/?ref=${encodeURIComponent(ref)}` : partner ? `${base}/?p=${partner}` : code ? `${base}/?invite=${encodeURIComponent(code)}` : `${base}/`;
  const keyboard = isPrivate ? [[{ text: code ? T.join : T.play, web_app: { url } }], [{ text: T.browser, url }]] : [[{ text: T.groups, url }]];
  return {
    method: 'sendMessage',
    chat_id: m.chat.id,
    text: ref ? T.invited : code ? T.invite(code) : T.hello,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard },
  };
}

export const registerTelegramRoutes: RouteModule = (router, deps) => {
  const { env, log } = deps;
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = token ? Buffer.from(webhookSecret(token)) : null;
  // a chat that floods gets a few answers a minute; repeated deliveries of one update are answered once
  const perChat = new RateLimiter(6, 6 / 60);
  const seen = new Set<number>();
  const remember = (id: number) => {
    seen.add(id);
    if (seen.size > 2000) for (const old of [...seen].slice(0, 1000)) seen.delete(old);
  };
  router.post('/api/telegram/webhook', async (ctx) => {
    if (!secret) throw new HttpError(404, 'not_found', 'Not found');
    const got = Buffer.from(String(ctx.req.headers['x-telegram-bot-api-secret-token'] ?? ''));
    if (got.length !== secret.length || !timingSafeEqual(got, secret)) throw new HttpError(401, 'unauthorized', 'Unauthorized');
    let update: TelegramUpdate;
    try {
      update = await ctx.body(Update, 256 * 1024);
    } catch {
      // an update this bot doesn't read: acknowledge it so Telegram doesn't send it again
      return ctx.json(200, {});
    }
    if (seen.has(update.update_id)) return ctx.json(200, {});
    remember(update.update_id);
    // v0.2.18 part 3: Telegram Stars — the payment questions are answered first and never rate-limited
    // (Telegram cancels a payment it gets no answer for within 10 s)
    const payments = deps.sql ? pgContext(deps.sql, env, log).payments : null;
    const q = update.pre_checkout_query;
    if (q) {
      const lang = langOf(q.from.language_code);
      const verdict = payments ? await payments.starsPreCheckout(q, lang) : { ok: false as const, error: lang === 'ru' ? 'Оплата сейчас недоступна.' : 'Payments are not available right now.' };
      log.info('stars pre-checkout', { ok: verdict.ok, stars: q.total_amount });
      const reply: PreCheckoutAnswer = verdict.ok ? { method: 'answerPreCheckoutQuery', pre_checkout_query_id: q.id, ok: true } : { method: 'answerPreCheckoutQuery', pre_checkout_query_id: q.id, ok: false, error_message: verdict.error };
      return ctx.json(200, reply);
    }
    const paid = update.message?.successful_payment;
    const back = update.message?.refunded_payment;
    if ((paid || back) && update.message) {
      const T = TEXT[langOf(update.message.from?.language_code)];
      if (!payments) return ctx.json(200, {});
      if (paid) {
        const n = await payments.starsPaid(paid);
        log.info('stars payment', { credited: n, stars: paid.total_amount });
        if (n <= 0) return ctx.json(200, {});
        const reply: BotText = { method: 'sendMessage', chat_id: update.message.chat.id, text: T.paid(n), parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
        return ctx.json(200, reply);
      }
      await payments.starsRefunded(back!);
      log.warn('stars refund reported', { stars: back!.total_amount });
      return ctx.json(200, { method: 'sendMessage', chat_id: update.message.chat.id, text: T.refunded, parse_mode: 'HTML', link_preview_options: { is_disabled: true } } satisfies BotText);
    }
    const payCmd = payCommandAnswer(update, env.PUBLIC_URL, env.PAY_SUPPORT, env.TELEGRAM_BOT_USERNAME);
    if (payCmd) return perChat.take(String(payCmd.chat_id)) ? ctx.json(200, payCmd) : ctx.json(200, {});
    const answer = botAnswer(update, env.PUBLIC_URL, env.TELEGRAM_BOT_USERNAME);
    if (!answer || !perChat.take(String(answer.chat_id))) return ctx.json(200, {});
    log.info('telegram bot answered', { chatType: update.message?.chat.type, invite: answer.text.includes('<code>'), link: answer.text === TEXT.ru.link || answer.text === TEXT.en.link });
    // the link must still open a running server when it is tapped a few minutes later
    deps.keepAwake?.extend(env.BOT_WARM_MINUTES * 60_000);
    ctx.json(200, answer);
  });
};

type Fetch = typeof fetch;
export { botApi };

/**
 * Registers the webhook (and the bot's commands, menu button and descriptions) unless Telegram already
 * calls this exact address. Returns what it did; never throws — a bot that can't be set up must not
 * stop the game server.
 */
export async function setupBot(env: Pick<Env, 'TELEGRAM_BOT_TOKEN' | 'PUBLIC_URL' | 'NODE_ENV'>, log: Logger, fetchImpl: Fetch = fetch): Promise<'off' | 'unchanged' | 'registered' | 'failed'> {
  if (!botEnabled(env)) return 'off';
  const token = env.TELEGRAM_BOT_TOKEN!;
  const url = webhookUrl(env.PUBLIC_URL);
  try {
    const info = await botApi<{ url?: string; last_error_message?: string }>(token, 'getWebhookInfo', {}, fetchImpl);
    if (info.url === url) {
      if (info.last_error_message) log.warn('telegram webhook reports an error', { error: info.last_error_message });
      return 'unchanged';
    }
    await botApi(token, 'setWebhook', { url, secret_token: webhookSecret(token), allowed_updates: ['message', 'pre_checkout_query'], max_connections: 20 }, fetchImpl);
    const app = `${env.PUBLIC_URL.replace(/\/$/, '')}/`;
    const cosmetic: [string, Record<string, unknown>][] = [
      ['setMyCommands', { commands: TEXT.en.commands }],
      ['setMyCommands', { commands: TEXT.ru.commands, language_code: 'ru' }],
      ['setMyShortDescription', { short_description: TEXT.en.short }],
      ['setMyShortDescription', { short_description: TEXT.ru.short, language_code: 'ru' }],
      ['setMyDescription', { description: TEXT.en.description }],
      ['setMyDescription', { description: TEXT.ru.description, language_code: 'ru' }],
      // the button beside the message field opens the game; its label can't depend on the language
      ['setChatMenuButton', { menu_button: { type: 'web_app', text: 'Play', web_app: { url: app } } }],
    ];
    for (const [method, params] of cosmetic) {
      try {
        await botApi(token, method, params, fetchImpl);
      } catch (e) {
        log.warn('telegram bot setting not applied', { method, err: e as Error });
      }
    }
    log.info('telegram webhook registered', { url: url.replace(/\?.*$/, '') });
    return 'registered';
  } catch (e) {
    log.warn('telegram webhook not registered', { err: e as Error });
    return 'failed';
  }
}
