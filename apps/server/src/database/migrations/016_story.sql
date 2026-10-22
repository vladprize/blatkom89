-- v0.3 part 4: the story mode. A row per mission a player has finished (the first time pays the
-- mission's talons and experience; the chapter's achievement pays the chapter's rewards once).
CREATE TABLE IF NOT EXISTS story_progress (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id   text NOT NULL CHECK (mission_id ~ '^[a-z0-9_]{1,16}$'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  best_ms      integer NOT NULL CHECK (best_ms >= 0),
  completions  integer NOT NULL DEFAULT 1 CHECK (completions >= 1),
  PRIMARY KEY (user_id, mission_id)
);

-- story talons in the ledger; a story reward is paid at most once per player (and reference)
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_reason_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_reason_check CHECK (reason IN ('match', 'purchase', 'mod', 'case', 'topup', 'grant', 'refund', 'story'));
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_story_once ON currency_ledger (user_id, ref) WHERE reason = 'story';

-- characters and skins the story hands out
ALTER TABLE user_items DROP CONSTRAINT IF EXISTS user_items_source_check;
ALTER TABLE user_items ADD CONSTRAINT user_items_source_check CHECK (source IN ('tokens', 'diamonds', 'case', 'grant', 'story'));
