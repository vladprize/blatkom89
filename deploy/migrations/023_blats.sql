-- v0.2.18 (the owner's pre-release edits). Adds only; nothing existing is dropped or rewritten.
--
-- The crypto theme is gone: the old $BLAT points (profiles.blat, the 'blat' ledger rows, blat_pools,
-- the BLAT DROP date, the balance snapshots, the tournament's stakes) stay in the database as they are,
-- but nothing pays, moves or shows them any more.
--
-- 1. BLATS — the premium currency (the «diamonds» columns: 1 BLATS = 1 US cent) — 10 for every new
--    level, each level once: `blats_level` remembers how far the levels are paid (the levels reached
--    before v0.2.18 are paid at the player's next sign-in), and the ledger's operation id `level:7`
--    can be written once per player.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blats_level integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_blats_level_once ON currency_ledger (user_id, ref) WHERE currency = 'diamonds' AND reason = 'level';

-- 2. Invitations pay talons: one ledger row per invited player (`referral:<id>`), never twice.
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_referral_talons_once ON currency_ledger (user_id, ref) WHERE currency = 'tokens' AND reason = 'referral';

-- 3. Weapon skins are bought for BLATS one weapon at a time (user_items.source 'diamonds', as characters
--    already are) — nothing to change in the tables.
