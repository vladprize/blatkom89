-- v0.2.24 — the Season Pass (packages/shared/src/game-rules/pass.ts). Adds tables and widens two checks;
-- nothing existing is changed, rewritten or removed.
--
-- One pass per player and season, bought for BLATS. The purchase keeps the schedule it was bought under (the
-- season's first moment and its weeks), so a later season set on the server never takes its weeks away.
CREATE TABLE IF NOT EXISTS pass_purchases (
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id    text        NOT NULL CHECK (season_id ~ '^[a-z0-9-]{1,16}$'),
  season_start timestamptz NOT NULL,
  weeks        smallint    NOT NULL CHECK (weeks BETWEEN 1 AND 12),
  price        integer     NOT NULL CHECK (price >= 0),
  bought_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);
CREATE INDEX IF NOT EXISTS pass_purchases_season_idx ON pass_purchases (season_id, bought_at);

-- What each opened week gave: a skin and a character (null when none was left to give — then BLATS). The key
-- makes a week give once, however often or concurrently it is asked for.
CREATE TABLE IF NOT EXISTS pass_drops (
  user_id         uuid        NOT NULL,
  season_id       text        NOT NULL,
  week            smallint    NOT NULL CHECK (week BETWEEN 1 AND 12),
  skin_id         text        CHECK (skin_id IS NULL OR skin_id ~ '^[a-z0-9_]{2,24}\.[a-z0-9_]{2,24}$'),
  skin_rarity     text        CHECK (skin_rarity IS NULL OR skin_rarity IN ('common', 'rare', 'epic', 'legendary')),
  character_id    text        CHECK (character_id IS NULL OR character_id ~ '^[a-z0-9_]{2,24}$'),
  character_grade text        CHECK (character_grade IS NULL OR character_grade IN ('common', 'rare', 'epic', 'legendary')),
  blats           integer     NOT NULL DEFAULT 0 CHECK (blats >= 0),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id, week),
  FOREIGN KEY (user_id, season_id) REFERENCES pass_purchases (user_id, season_id) ON DELETE CASCADE
);

-- items a pass gave are marked as such; BLATS a week gave instead of a skin or a character are a 'pass' row in
-- the ledger (the checks keep every value they had)
ALTER TABLE user_items DROP CONSTRAINT IF EXISTS user_items_source_check;
ALTER TABLE user_items ADD CONSTRAINT user_items_source_check CHECK (source IN ('tokens', 'diamonds', 'case', 'grant', 'story', 'pass'));
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_reason_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_reason_check CHECK (reason IN ('match', 'purchase', 'mod', 'case', 'topup', 'grant', 'refund', 'level', 'referral', 'story', 'allocation', 'stake', 'stake_win', 'stake_refund', 'welcome', 'promo', 'pass'));
