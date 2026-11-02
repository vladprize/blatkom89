-- v0.2.18 part 2 — the owner's skin line and the character case. Adds only; nothing existing is dropped or
-- rewritten.
--
-- 1. The welcome gift for early players: «Акула» and «Блатком ’89» on every weapon. Not sold and not stored
-- as items — one mark per player, set at the player's sign-in while the gift lasts (WELCOME_GIFT_UNTIL;
-- unset: the gift has no end yet). A player with the mark owns both finishes on every weapon, for good.
--
-- 2. The first line's finishes (berezka … yantar) are retired, not removed: the rows in user_items stay, and
-- whoever owns one keeps it.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_gift_at timestamptz;

-- 3. The character case (299 BLATS, a character sold for BLATS the player doesn't own): its openings are
--    recorded in case_openings next to the weapon and skin cases — kind 'character', the character's id;
--    such a row has no weapon (the column stops being required; every existing row keeps its weapon).
ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS character_id text CHECK (character_id IS NULL OR character_id ~ '^[a-z0-9_]{2,24}$');
ALTER TABLE case_openings ALTER COLUMN weapon_id DROP NOT NULL;
-- the kind's check from 011 gives way to the wider one, whatever name the database gave it
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'case_openings'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE case_openings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE case_openings ADD CONSTRAINT case_openings_kind_check CHECK (kind IN ('weapon', 'skin', 'character'));
