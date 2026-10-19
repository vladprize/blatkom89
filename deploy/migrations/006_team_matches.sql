-- Team modes (red vs blue: team deathmatch, capture the flag, base capture) and rooms of up to 10
-- players: the mode of every match and the team of every participant (null in free-for-all).
-- See docs/NETCODE.md and packages/shared/src/game-rules/match.ts.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'ffa' CHECK (mode IN ('ffa', 'teams', 'ctf', 'bases'));
-- red 0 / blue 1 when the match ended in a team victory; null for a draw or a free-for-all match
ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_team smallint CHECK (winner_team IN (0, 1));
ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS team smallint CHECK (team IN (0, 1));
CREATE INDEX IF NOT EXISTS matches_mode_started_idx ON matches (mode, started_at);
