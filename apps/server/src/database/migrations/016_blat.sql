-- V2.0: $BLAT — in-game points that only accumulate. Not money and not a cryptocurrency: no buying,
-- selling, withdrawing or giving them to someone else. The balance lives on the profile; every change is a
-- row in the currency ledger with its own operation id (ref), and the same operation is never written
-- twice for a player (docs/BLAT.md). Nothing existing is dropped or rewritten.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blat integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blat_earned integer NOT NULL DEFAULT 0;
-- the highest level whose reward has been paid (levels are paid once; a profile read pays the rest)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blat_level integer NOT NULL DEFAULT 0;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_blat_bounds;
ALTER TABLE profiles ADD CONSTRAINT profiles_blat_bounds CHECK (blat BETWEEN 0 AND 2000000000 AND blat_earned BETWEEN 0 AND 2000000000 AND blat_level >= 0);

ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_currency_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_currency_check CHECK (currency IN ('tokens', 'diamonds', 'blat'));
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_reason_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_reason_check CHECK (reason IN ('match', 'purchase', 'mod', 'case', 'topup', 'grant', 'refund', 'level', 'referral'));
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_blat_ref;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_blat_ref CHECK (currency <> 'blat' OR ref IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_blat_once ON currency_ledger (user_id, ref) WHERE currency = 'blat';
CREATE INDEX IF NOT EXISTS currency_ledger_blat_time ON currency_ledger (created_at) WHERE currency = 'blat';

-- the referral programme: a code per player (made when first asked for), the inviter of a new account
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_code text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ref_code_check;
ALTER TABLE users ADD CONSTRAINT users_ref_code_check CHECK (ref_code IS NULL OR ref_code ~ '^[A-Za-z0-9_-]{4,32}$');
CREATE UNIQUE INDEX IF NOT EXISTS users_ref_code_key ON users (lower(ref_code)) WHERE ref_code IS NOT NULL;
-- an administrator's mark on a suspicious account: no referral rewards, left out of balance exports
ALTER TABLE users ADD COLUMN IF NOT EXISTS blat_flag text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_blat_flag_check;
ALTER TABLE users ADD CONSTRAINT users_blat_flag_check CHECK (blat_flag IS NULL OR char_length(blat_flag) BETWEEN 1 AND 200);

CREATE TABLE IF NOT EXISTS referrals (
  referee_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  referrer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  code        text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{4,32}$'),
  attached_at timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'held', 'rejected')),
  decided_at  timestamptz,
  ordinal     integer CHECK (ordinal IS NULL OR ordinal >= 1),
  reward      integer NOT NULL DEFAULT 0 CHECK (reward >= 0),
  note        text CHECK (note IS NULL OR char_length(note) <= 200),
  CHECK (referrer_id IS NULL OR referrer_id <> referee_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id, status, decided_at);
CREATE INDEX IF NOT EXISTS referrals_status_idx ON referrals (status, attached_at);
