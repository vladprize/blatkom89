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
  DEV_AUTH_ENABLED: bool.default('false'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default('false'),
  ADMIN_BOOTSTRAP_USERNAME: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  STATIC_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SERVER_VERSION: z.string().default('0.1.0'),
  MAX_ROOMS: z.coerce.number().int().min(1).max(10000).default(500),
  /** Match rules (free-for-all deathmatch). Defaults: 4 minutes, 25 eliminations, 2–6 players. */
  MATCH_DURATION_SEC: z.coerce.number().int().min(30).max(900).default(240),
  MATCH_SCORE_LIMIT: z.coerce.number().int().min(1).max(200).default(25),
  MATCH_MIN_PLAYERS: z.coerce.number().int().min(2).max(6).default(2),
  MATCH_MAX_PLAYERS: z.coerce.number().int().min(2).max(6).default(6),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.MATCH_MIN_PLAYERS > env.MATCH_MAX_PLAYERS) throw new Error('MATCH_MIN_PLAYERS must not exceed MATCH_MAX_PLAYERS');
  if (env.NODE_ENV === 'production') {
    if (env.DEV_AUTH_ENABLED) throw new Error('DEV_AUTH_ENABLED must be false in production');
    if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is required in production');
    if (/change-me|example|secret/i.test(env.SESSION_SECRET)) throw new Error('SESSION_SECRET looks like a placeholder');
  }
  return env;
}

/** Match configuration derived from the environment (see MATCH_* variables). */
export function matchConfigFromEnv(env: Env): { durationMs: number; scoreLimit: number; minPlayers: number; maxPlayers: number } {
  return { durationMs: env.MATCH_DURATION_SEC * 1000, scoreLimit: env.MATCH_SCORE_LIMIT, minPlayers: env.MATCH_MIN_PLAYERS, maxPlayers: env.MATCH_MAX_PLAYERS };
}
