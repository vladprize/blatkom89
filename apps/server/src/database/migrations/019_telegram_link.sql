-- V2.0 part E: Telegram is attached to an account that already exists, so opening the game in Telegram
-- never makes a second profile (docs/TELEGRAM.md §4).
--
-- * telegram_link_codes — a one-time code a player asks for on the website and uses through the bot
--   within 10 minutes; only an HMAC of the code is kept. Used codes are purged after a day.
-- * users.merged_into — set on an empty account (no match, no XP, nothing owned) that Telegram had made
--   on a first launch and that let its Telegram id go to the player's real account. The empty account
--   is kept as it was (nothing is deleted); it is left out of player counts.
--
-- Only a new table, new columns and a wider check; nothing existing is changed.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code_hash  text PRIMARY KEY CHECK (char_length(code_hash) BETWEEN 20 AND 64),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_idx ON telegram_link_codes (user_id);
CREATE INDEX IF NOT EXISTS telegram_link_codes_expiry_idx ON telegram_link_codes (expires_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS merged_at timestamptz;
CREATE INDEX IF NOT EXISTS users_merged_idx ON users (merged_into) WHERE merged_into IS NOT NULL;

-- every account has a way in — or, now, was merged into the account that has it (the condition only
-- grows: every existing row still passes)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_check;
ALTER TABLE users ADD CONSTRAINT users_identity_check CHECK (telegram_id IS NOT NULL OR dev_device_id IS NOT NULL OR email IS NOT NULL OR oauth_only OR merged_at IS NOT NULL OR deleted_at IS NOT NULL);
