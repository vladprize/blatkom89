-- v0.3 part 3: sign-in with Google, Facebook, Discord and Reddit (apps/server/src/auth/oauth.ts) and
-- Telegram on the website (auth/telegramLogin.ts — it uses users.telegram_id, like the Mini App).
-- Only the provider's id for the player is kept: no email, no picture, no tokens.
CREATE TABLE IF NOT EXISTS user_identities (
  provider     text NOT NULL CHECK (provider IN ('google', 'facebook', 'discord', 'reddit')),
  provider_uid text NOT NULL CHECK (char_length(provider_uid) BETWEEN 1 AND 200),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_uid)
);
-- one account of each provider per player
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_user_provider ON user_identities (user_id, provider);

-- One-time codes that hand a sign-in from the provider's redirect to the page (valid a few minutes,
-- used once; only a hash of the code is stored).
CREATE TABLE IF NOT EXISTS auth_handoffs (
  code_hash  text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   text NOT NULL,
  is_new     boolean NOT NULL DEFAULT false,
  linked     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_handoffs_created_idx ON auth_handoffs (created_at);

-- an account may exist only through a provider (signed up with Google without a guest first)
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_only boolean NOT NULL DEFAULT false;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_check;
ALTER TABLE users ADD CONSTRAINT users_identity_check CHECK (telegram_id IS NOT NULL OR dev_device_id IS NOT NULL OR email IS NOT NULL OR oauth_only OR deleted_at IS NOT NULL);
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_method_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_method_check CHECK (method IN ('telegram', 'dev', 'guest', 'email', 'oauth'));
