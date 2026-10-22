-- v0.3 clubs: crews with a name, a tag, a flag and an emblem; one club per player; join requests the
-- club's head answers; a rating that moves with the members' results (packages/shared/src/game-rules/clubs.ts).
-- Names and tags are unique by the same folded key as aliases (computed in code: game-rules/aliases.ts).
-- The application checks the lengths (3–24, 2–4, 60 characters); the database only keeps them sane —
-- generous bounds, because a database created with SQL_ASCII counts bytes, not letters.
CREATE TABLE IF NOT EXISTS clubs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  name_key    text NOT NULL,
  tag         text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 20),
  tag_key     text NOT NULL,
  motto       text NOT NULL DEFAULT '' CHECK (char_length(motto) <= 250),
  flag        jsonb NOT NULL,
  emblem      jsonb NOT NULL,
  head_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  recruiting  boolean NOT NULL DEFAULT true,
  rating      integer NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  -- clubs the game keeps itself (the table is never empty): their people and their rating's drift
  -- come from the club's seed (apps/server/src/clubs/house.ts); never shown to players as different
  house_seed  integer,
  house_size  integer NOT NULL DEFAULT 0 CHECK (house_size >= 0),
  drift_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_name_key_unique ON clubs (name_key);
CREATE UNIQUE INDEX IF NOT EXISTS clubs_tag_key_unique ON clubs (tag_key);
CREATE INDEX IF NOT EXISTS clubs_rating_idx ON clubs (rating DESC, created_at);

CREATE TABLE IF NOT EXISTS club_members (
  club_id    uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('head', 'member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);
-- one club at a time
CREATE UNIQUE INDEX IF NOT EXISTS club_members_user_unique ON club_members (user_id);

CREATE TABLE IF NOT EXISTS club_requests (
  club_id    uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX IF NOT EXISTS club_requests_user_idx ON club_requests (user_id);
