-- v0.2.20 (the owner: «Добавить в списки игроков пару сотен фейк аккаунтов с натуральными никами»). Adds
-- only; nothing existing is dropped or rewritten.
--
-- House players: accounts the game keeps itself so the player tables are never empty (like the house clubs
-- of v0.3). They are rows of `users` with `house_player` set: nobody can sign in to them (no Telegram, no
-- device key, no email, no provider), their numbers move slowly by themselves (social/housePlayers.ts),
-- and they are left out of everything that counts real people — the admin's metrics, its player table and
-- exports, the tournament tables, rewards and invitations.
ALTER TABLE users ADD COLUMN IF NOT EXISTS house_player boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_house_player_idx ON users (id) WHERE house_player;

-- every account has a way in, was merged, was deleted — or is the game's own (the condition only grows)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_check;
ALTER TABLE users ADD CONSTRAINT users_identity_check CHECK (telegram_id IS NOT NULL OR dev_device_id IS NOT NULL OR email IS NOT NULL OR oauth_only OR merged_at IS NOT NULL OR deleted_at IS NOT NULL OR house_player);
