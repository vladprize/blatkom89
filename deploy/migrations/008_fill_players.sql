-- Players the server adds to complete a lineup (rooms/MatchRoom.ts, sim/fill.ts) are not users and
-- are never stored individually; matches keep how many there were next to the number of people.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bot_count integer NOT NULL DEFAULT 0 CHECK (bot_count >= 0 AND bot_count <= 10);
