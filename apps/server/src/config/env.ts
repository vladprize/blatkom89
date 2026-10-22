/** Environment configuration, validated at startup. See .env.example. */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Secret used to sign/derive tokens (min 32 chars). */
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 14),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_MINIAPP_SHORT_NAME: z.string().optional(),
  /** Maximum age of Telegram initData (seconds). */
  TELEGRAM_AUTH_MAX_AGE_SEC: z.coerce.number().int().min(60).max(7 * 86400).default(86400),
  /** After the bot hands out a link, the server keeps itself awake this long (free hosts sleep; 0 = off). */
  BOT_WARM_MINUTES: z.coerce.number().int().min(0).max(240).default(20),
  /** Ask the own public address every 5 minutes so a free host never puts the server to sleep. */
  KEEP_AWAKE: bool.default('false'),
  /** v0.3: «Log in with Telegram» on the website (needs /setdomain for the bot in @BotFather). */
  TELEGRAM_WEB_LOGIN: bool.default('false'),
  /** v0.3: sign-in with Google, Facebook, Discord, Reddit (docs/SIGN_IN.md); a provider is on when both keys are set. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_GRAPH_VERSION: z.string().regex(/^v\d{1,3}\.\d$/).default('v23.0'),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  DEV_AUTH_ENABLED: bool.default('false'),
  /** Public website without Telegram: players sign in as guests with a nickname (device-bound). */
  GUEST_AUTH_ENABLED: bool.default('false'),
  /** New guest accounts per address per hour (friends behind one Wi-Fi share an address). */
  GUEST_SIGNUPS_PER_IP_HOUR: z.coerce.number().int().min(1).max(10_000).default(10),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default('false'),
  ADMIN_BOOTSTRAP_USERNAME: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  STATIC_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Reported by /api/health and stored with errors; defaults to the version the bundle was built from. */
  SERVER_VERSION: z.string().default(process.env.BLATKOM_BUILD_VERSION ?? '0.0.0-dev'),
  MAX_ROOMS: z.coerce.number().int().min(1).max(10000).default(500),
  /** Match rules (free-for-all deathmatch). Defaults: 4 minutes, 50 points (elimination 2, assist 1), 2–6 players. */
  MATCH_DURATION_SEC: z.coerce.number().int().min(30).max(900).default(240),
  MATCH_SCORE_LIMIT: z.coerce.number().int().min(1).max(400).default(50),
  MATCH_MIN_PLAYERS: z.coerce.number().int().min(2).max(10).default(2),
  MATCH_MAX_PLAYERS: z.coerce.number().int().min(2).max(10).default(10),
  /** Team deathmatch ends when a team reaches this many eliminations. */
  MATCH_TEAM_SCORE_LIMIT: z.coerce.number().int().min(1).max(400).default(40),
  /** Capture the flag: captures to win. */
  MATCH_CAPTURE_LIMIT: z.coerce.number().int().min(1).max(20).default(3),
  /** Base capture: points to win (a point per base held per second). */
  MATCH_BASE_SCORE_LIMIT: z.coerce.number().int().min(10).max(2000).default(250),
  /**
   * Complete small lineups with players the server runs itself (4 in free-for-all, 3 a side in team
   * modes), so a match can always start; they look like everyone else (rooms/MatchRoom.ts).
   */
  MATCH_FILL_BOTS: bool.default('true'),
  /** Paid cases can be switched off where randomised paid items are restricted (docs/ECONOMY.md). */
  CASES_ENABLED: bool.default('true'),
  /** Card payments (Stripe Checkout). Both keys are required to enable them. */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Crypto payments (NOWPayments invoices). Both keys are required to enable them. */
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  NOWPAYMENTS_SANDBOX: bool.default('false'),
  /**
   * V2.0: the BLAT DROP announcement date players count down to (ISO 8601, e.g. 2027-04-23T12:00:00Z),
   * used until an administrator sets one in /admin → $BLAT (docs/BLAT.md §6).
   */
  BLAT_DROP_ANNOUNCE_AT: z.string().datetime({ offset: true }).optional(),
  /** Password-reset emails through Resend (https://resend.com); without a key the admin issues reset links. */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // a variable added in a dashboard but left empty counts as not set (a blank KEEP_AWAKE is «false»,
  // not an error that stops the server)
  source = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  // Render (and similar hosts) publish the service URL as RENDER_EXTERNAL_URL
  const publicUrlSet = !!source.PUBLIC_URL || !!source.RENDER_EXTERNAL_URL;
  if (!source.PUBLIC_URL && source.RENDER_EXTERNAL_URL) source = { ...source, PUBLIC_URL: source.RENDER_EXTERNAL_URL };
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.MATCH_MIN_PLAYERS > env.MATCH_MAX_PLAYERS) throw new Error('MATCH_MIN_PLAYERS must not exceed MATCH_MAX_PLAYERS');
  if (env.NODE_ENV === 'production') {
    if (env.DEV_AUTH_ENABLED) throw new Error('DEV_AUTH_ENABLED must be false in production');
    if (!env.TELEGRAM_BOT_TOKEN && !env.GUEST_AUTH_ENABLED) throw new Error('TELEGRAM_BOT_TOKEN is required in production (or GUEST_AUTH_ENABLED=true for a public website)');
    // invite links and the WebSocket origin check are built from PUBLIC_URL
    if (!publicUrlSet) throw new Error('PUBLIC_URL is required in production (the https address players open)');
    if (/change-me|example|secret/i.test(env.SESSION_SECRET)) throw new Error('SESSION_SECRET looks like a placeholder');
  }
  return env;
}

/** Match configuration derived from the environment (see MATCH_* variables). */
export function matchConfigFromEnv(env: Env): { durationMs: number; scoreLimit: number; teamScoreLimit: number; captureLimit: number; baseScoreLimit: number; minPlayers: number; maxPlayers: number } {
  return {
    durationMs: env.MATCH_DURATION_SEC * 1000,
    scoreLimit: env.MATCH_SCORE_LIMIT,
    teamScoreLimit: env.MATCH_TEAM_SCORE_LIMIT,
    captureLimit: env.MATCH_CAPTURE_LIMIT,
    baseScoreLimit: env.MATCH_BASE_SCORE_LIMIT,
    minPlayers: env.MATCH_MIN_PLAYERS,
    maxPlayers: env.MATCH_MAX_PLAYERS,
  };
}
