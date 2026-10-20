-- v0.23 social: unique aliases, rating, friends and direct messages.

-- 1. Aliases are unique among living accounts. users.name_key is the alias folded by the application
--    (letter case, spacing, Ё/Е, Cyrillic look-alikes of Latin letters — packages/shared
--    game-rules/aliases.ts): database locales differ in how they fold Cyrillic, so the key is computed
--    in code. The code step of this migration (database/codeSteps.ts) fills the column, renames later
--    duplicates («Петя» → «Петя 2», the oldest account keeps the alias) and adds the unique index
--    users_name_key_unique. Rows written without a key (an older server during a deploy, manual SQL)
--    get lower(display_name) from the trigger below.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_key text;
CREATE OR REPLACE FUNCTION users_name_key_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name_key IS NULL THEN
    NEW.name_key := lower(NEW.display_name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_name_key_default ON users;
CREATE TRIGGER users_name_key_default BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION users_name_key_default();

-- 2. Rating (the Top-100 table): starts at 1000, changes with every match (game-rules/progression.ts).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating integer NOT NULL DEFAULT 1000 CHECK (rating >= 0);
ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS rating_delta integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS profiles_rating_idx ON profiles (rating DESC) WHERE matches_completed > 0;
CREATE INDEX IF NOT EXISTS profiles_xp_idx ON profiles (xp DESC) WHERE matches_completed > 0;
CREATE INDEX IF NOT EXISTS profiles_kills_idx ON profiles (kills DESC) WHERE matches_completed > 0;

-- 3. Friends: a request is one row (user → friend, pending); an accepted friendship is two rows, one
--    for each side (accepted), so «my friends» is a single index lookup.
CREATE TABLE IF NOT EXISTS friendships (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS friendships_friend_idx ON friendships (friend_id, status);

-- 4. Direct messages between friends (kept 180 days, see analytics/retention.ts and docs/PRIVACY.md).
CREATE TABLE IF NOT EXISTS direct_messages (
  id           bigserial PRIMARY KEY,
  sender_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX IF NOT EXISTS direct_messages_pair_idx ON direct_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), id DESC);
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx ON direct_messages (recipient_id, sender_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS direct_messages_time_idx ON direct_messages (created_at);
