-- V2.0 part D: «Блатной кон» — ranked matches 1×1 … 5×5 with their own rating for players and gangs,
-- apart from the general rating and from $BLAT (docs/KON.md). Only new columns; nothing existing changes.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_rating integer NOT NULL DEFAULT 1000;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_matches integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_wins integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_losses integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_draws integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_streak integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kon_best_streak integer NOT NULL DEFAULT 0;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_kon_bounds;
ALTER TABLE profiles ADD CONSTRAINT profiles_kon_bounds CHECK (kon_rating >= 0 AND kon_matches >= 0 AND kon_wins >= 0 AND kon_losses >= 0 AND kon_draws >= 0 AND kon_streak >= 0 AND kon_best_streak >= 0);
CREATE INDEX IF NOT EXISTS profiles_kon_rating_idx ON profiles (kon_rating DESC, kon_wins DESC) WHERE kon_matches > 0;

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kon_rating integer NOT NULL DEFAULT 1000;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kon_matches integer NOT NULL DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kon_wins integer NOT NULL DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kon_losses integer NOT NULL DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kon_draws integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS clubs_kon_rating_idx ON clubs (kon_rating DESC) WHERE kon_matches > 0;

ALTER TABLE matches ADD COLUMN IF NOT EXISTS kon_format text;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_kon_format_check;
ALTER TABLE matches ADD CONSTRAINT matches_kon_format_check CHECK (kon_format IS NULL OR kon_format IN ('1x1', '2x2', '3x3', '5x5'));
CREATE INDEX IF NOT EXISTS matches_kon_idx ON matches (ended_at DESC) WHERE kon_format IS NOT NULL;

ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS kon_delta integer NOT NULL DEFAULT 0;
