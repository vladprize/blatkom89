-- v0.2.20 (the owner's final edits). Adds only; nothing existing is dropped or rewritten.
--
-- 1. The welcome bonus: BLATS (WELCOME_BONUS_BLATS, 199 by default) for registering the account — an email,
--    or a sign-in provider on the website — once per account: the ledger row `welcome` can be written once.
-- 2. Promo codes for BLATS: each code once per account (the ledger's operation id `promo:<CODE>` can be
--    written once per player). The codes live in promo_codes — the amount, an end date and a cap on uses are
--    set there, not in the code. BLATNOY (500) is the owner's code for his friends.
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_reason_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_reason_check CHECK (reason IN ('match', 'purchase', 'mod', 'case', 'topup', 'grant', 'refund', 'level', 'referral', 'story', 'allocation', 'stake', 'stake_win', 'stake_refund', 'welcome', 'promo'));

CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_welcome_once ON currency_ledger (user_id) WHERE reason = 'welcome';
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_promo_once ON currency_ledger (user_id, ref) WHERE reason = 'promo';
CREATE INDEX IF NOT EXISTS currency_ledger_promo_ref ON currency_ledger (ref) WHERE reason = 'promo';

CREATE TABLE IF NOT EXISTS promo_codes (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  diamonds    integer NOT NULL CHECK (diamonds > 0 AND diamonds <= 100000),
  active      boolean NOT NULL DEFAULT true,
  max_uses    integer CHECK (max_uses IS NULL OR max_uses > 0),
  expires_at  timestamptz,
  note        text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO promo_codes (code, diamonds, note) VALUES ('BLATNOY', 500, 'Код владельца для друзей (v0.2.20)') ON CONFLICT (code) DO NOTHING;
