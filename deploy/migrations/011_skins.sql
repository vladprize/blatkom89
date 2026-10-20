-- v0.23 weapon skins: an owned skin is a user_items row of kind 'skin' whose item_id is
-- «weapon.finish» (e.g. avtomat.hohloma); equipped ones live in profiles.loadout.skins. The skin case
-- is recorded in case_openings next to the weapon case (kind, finish; skins have a «common» rarity).
ALTER TABLE user_items DROP CONSTRAINT IF EXISTS user_items_kind_check;
ALTER TABLE user_items ADD CONSTRAINT user_items_kind_check CHECK (kind IN ('weapon', 'character', 'gadget', 'skin'));
ALTER TABLE user_items DROP CONSTRAINT IF EXISTS user_items_item_id_check;
ALTER TABLE user_items ADD CONSTRAINT user_items_item_id_check CHECK (item_id ~ '^[a-z0-9_]{2,24}(\.[a-z0-9_]{2,24})?$');

ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'weapon' CHECK (kind IN ('weapon', 'skin'));
ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS finish_id text CHECK (finish_id IS NULL OR finish_id ~ '^[a-z0-9_]{2,24}$');
ALTER TABLE case_openings DROP CONSTRAINT IF EXISTS case_openings_rarity_check;
ALTER TABLE case_openings ADD CONSTRAINT case_openings_rarity_check CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));
CREATE INDEX IF NOT EXISTS case_openings_kind_idx ON case_openings (kind, created_at);
