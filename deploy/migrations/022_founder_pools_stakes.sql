-- v0.2.17 (the owner's last edits before the public release). Adds only; nothing existing is dropped or
-- rewritten.
--
-- 1. The founder: a gold «Founder» badge next to the alias and the hidden way into /admin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS founder boolean NOT NULL DEFAULT false;

-- 2. $BLAT's supply, capped at 2 000 000 000 and split into pools (game-rules/blat.ts BLAT_POOLS): every
--    credit comes out of a pool and a pool never gives more than its cap. The players' pool pays levels
--    and invitations; the founder's, the influencers', the friends' and the reserve only an
--    administrator's allocation. What was paid before this release is counted to the players' pool.
CREATE TABLE IF NOT EXISTS blat_pools (
  pool   text PRIMARY KEY CHECK (pool IN ('players', 'founder', 'influencers', 'friends', 'reserve')),
  cap    bigint NOT NULL CHECK (cap >= 0),
  issued bigint NOT NULL DEFAULT 0 CHECK (issued >= 0),
  CHECK (issued <= cap)
);
INSERT INTO blat_pools (pool, cap) VALUES
  ('players', 1260000000), ('founder', 320000000), ('influencers', 300000000), ('friends', 100000000), ('reserve', 20000000)
ON CONFLICT (pool) DO NOTHING;
UPDATE blat_pools SET issued = LEAST(cap, (SELECT COALESCE(sum(delta), 0) FROM currency_ledger WHERE currency = 'blat' AND delta > 0 AND reason IN ('level', 'referral', 'grant')))
WHERE pool = 'players' AND issued = 0;

-- 3. Ledger reasons: `allocation` (a pool's share given by an administrator), and the $BLAT Tournament's
--    `stake` (reserved at the start), `stake_win` (the pool shared by the winners), `stake_refund` (a draw,
--    an aborted match). Every $BLAT row keeps its unique operation id (currency_ledger_blat_once).
ALTER TABLE currency_ledger DROP CONSTRAINT IF EXISTS currency_ledger_reason_check;
ALTER TABLE currency_ledger ADD CONSTRAINT currency_ledger_reason_check CHECK (reason IN ('match', 'purchase', 'mod', 'case', 'topup', 'grant', 'refund', 'level', 'referral', 'story', 'allocation', 'stake', 'stake_win', 'stake_refund'));

-- 4. The $BLAT Tournament: a staked match (both sides stake the same) and its state; a stake that was
--    reserved is settled exactly once (the match row is locked while it is).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake integer NOT NULL DEFAULT 0 CHECK (stake >= 0 AND stake <= 100000);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stakes_state text CHECK (stakes_state IS NULL OR stakes_state IN ('reserved', 'settled', 'refunded'));
CREATE INDEX IF NOT EXISTS matches_stakes_open_idx ON matches (started_at) WHERE stakes_state = 'reserved';
CREATE INDEX IF NOT EXISTS currency_ledger_stake_day ON currency_ledger (user_id, created_at) WHERE reason = 'stake';

-- 5. BLAT DROP: the owner's announcement date — «one date, 3 months and 15 days from now» (24 October
--    2026): 8 February 2027, 23:00 in Cyprus. It replaces whatever was set before (a «not set» left by
--    checks, an earlier date); an administrator can still change it in /admin → $BLAT.
INSERT INTO app_settings (key, value, updated_at, updated_by)
VALUES ('blat_drop.announce_at', '{"announceAt": "2027-02-08T21:00:00.000Z"}'::jsonb, now(), NULL)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = NULL;
