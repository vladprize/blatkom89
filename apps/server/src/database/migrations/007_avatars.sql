-- Profile avatars: the id of one of the round pixel portraits a player picks in the profile
-- (packages/shared/src/game-rules/avatars.ts); null shows the character's portrait. The application
-- validates the id against the list; the check only keeps the column to short lowercase ids.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar text CHECK (avatar ~ '^[a-z]{2,16}$');
