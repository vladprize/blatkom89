-- v0.24: the game is free (REAL_MONEY off in packages/shared/src/game-rules/economy.ts). Cases are
-- opened with talons, which are earned in matches and never sold; every case opening now records
-- the currency it was paid in. Openings before v0.24 were paid in diamonds.
ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'diamonds' CHECK (currency IN ('tokens', 'diamonds'));
ALTER TABLE case_openings ALTER COLUMN currency SET DEFAULT 'tokens';
