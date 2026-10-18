-- Economy (tokens, diamonds, shop items, upgrades, cases, payments), email sign-in and the
-- visitor funnel. See packages/shared/src/game-rules/economy.ts and docs/ECONOMY.md.

-- Character and map ids are validated by the application (shared zod enums); the database keeps a
-- format check only, so new characters and maps do not need a migration each.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_preferred_character_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_preferred_character_check CHECK (preferred_character ~ '^[a-z_]{2,24}$');
ALTER TABLE match_participants DROP CONSTRAINT IF EXISTS match_participants_character_check;
ALTER TABLE match_participants ADD CONSTRAINT match_participants_character_check CHECK (character ~ '^[a-z_]{2,24}$');
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_map_id_check;
ALTER TABLE matches ADD CONSTRAINT matches_map_id_check CHECK (map_id ~ '^[a-z_]{2,24}$');

-- ── Wallet ────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tokens integer NOT NULL DEFAULT 0 CHECK (tokens >= 0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamonds integer NOT NULL DEFAULT 0 CHECK (diamonds >= 0);
-- spawn loadout {sidearm, melee, primary}; validated against ownership on every read
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS loadout jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS tokens_awarded integer NOT NULL DEFAULT 0 CHECK (tokens_awarded >= 0);

-- Every change of a balance, with the balance after it (audit trail and admin economy charts).
CREATE TABLE currency_ledger (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency      text NOT NULL CHECK (currency IN ('tokens', 'diamonds')),
  delta         integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason        text NOT NULL CHECK (reason IN ('match', 'purchase', 'upgrade', 'case', 'topup', 'grant', 'refund')),
  ref           text,
  admin_id      uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX currency_ledger_user_idx ON currency_ledger (user_id, created_at DESC);
CREATE INDEX currency_ledger_time_idx ON currency_ledger (created_at);
-- a payment is credited at most once
CREATE UNIQUE INDEX currency_ledger_topup_once ON currency_ledger (ref) WHERE reason = 'topup';

-- Owned weapons and characters (the free ones are implicit and never stored).
CREATE TABLE user_items (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     text NOT NULL CHECK (item_id ~ '^[a-z_]{2,24}$'),
  kind        text NOT NULL CHECK (kind IN ('weapon', 'character')),
  source      text NOT NULL CHECK (source IN ('tokens', 'diamonds', 'case', 'grant')),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, item_id)
);
CREATE INDEX user_items_item_idx ON user_items (kind, item_id);

CREATE TABLE weapon_upgrades (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon_id  text NOT NULL CHECK (weapon_id ~ '^[a-z_]{2,24}$'),
  stat       text NOT NULL CHECK (stat IN ('dmg', 'rate', 'reload', 'mag')),
  level      integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weapon_id, stat)
);

CREATE TABLE case_openings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon_id  text NOT NULL,
  rarity     text NOT NULL CHECK (rarity IN ('rare', 'epic', 'legendary')),
  price      integer NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_openings_time_idx ON case_openings (created_at);
CREATE INDEX case_openings_user_idx ON case_openings (user_id);

-- Real-money purchases of diamonds. Credited once, when the provider confirms the payment.
CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  provider     text NOT NULL CHECK (provider IN ('stripe', 'nowpayments', 'telegram')),
  provider_ref text,
  pack_id      text NOT NULL,
  diamonds     integer NOT NULL CHECK (diamonds > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency     text NOT NULL DEFAULT 'usd',
  status       text NOT NULL CHECK (status IN ('created', 'paid', 'failed', 'expired', 'refunded')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_provider_ref_idx ON payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);
CREATE INDEX payments_time_idx ON payments (created_at);

-- ── Email sign-in ─────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text CHECK (email IS NULL OR (char_length(email) <= 254 AND email = lower(email)));
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_linked_at timestamptz;
CREATE UNIQUE INDEX users_email_idx ON users (email) WHERE email IS NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users ADD CONSTRAINT users_identity_check CHECK (telegram_id IS NOT NULL OR dev_device_id IS NOT NULL OR email IS NOT NULL OR deleted_at IS NOT NULL);
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_method_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_method_check CHECK (method IN ('telegram', 'dev', 'guest', 'email'));

CREATE TABLE password_resets (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  text NOT NULL CHECK (created_by IN ('email', 'admin'))
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- ── Visitor funnel ────────────────────────────────────────────────────────
-- Anonymous, random per-browser id (no IP, no fingerprint): «opened the site» before signing up.
CREATE TABLE visitors (
  visitor_id    text PRIMARY KEY CHECK (visitor_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  platform      text,
  referrer      text,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX visitors_first_seen_idx ON visitors (first_seen_at);
CREATE INDEX visitors_user_idx ON visitors (user_id) WHERE user_id IS NOT NULL;
CREATE TABLE visitor_days (
  visitor_id text NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
  day        date NOT NULL,
  PRIMARY KEY (visitor_id, day)
);
CREATE INDEX visitor_days_day_idx ON visitor_days (day);
