-- Assists: damage on a victim that another player eliminated (see SCORING in packages/shared).
-- Counted per match participant and accumulated in the player's profile.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assists integer NOT NULL DEFAULT 0 CHECK (assists >= 0);
ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS assists integer NOT NULL DEFAULT 0 CHECK (assists >= 0);
