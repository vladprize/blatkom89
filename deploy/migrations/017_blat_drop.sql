-- V2.0 part C: BLAT DROP — the announcement date an administrator sets (every player sees the same
-- countdown, by the server's clock), and balance snapshots: a frozen copy of every $BLAT balance at one
-- moment, kept for a decision taken separately. Nothing here creates a token, a wallet, a price or a
-- transfer (docs/BLAT.md). Only new tables; nothing existing is changed.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]{2,64}$'),
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS blat_snapshots (
  id             uuid PRIMARY KEY,
  taken_at       timestamptz NOT NULL,
  taken_by       uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  note           text CHECK (note IS NULL OR char_length(note) <= 200),
  accounts       integer NOT NULL CHECK (accounts >= 0),
  eligible       integer NOT NULL CHECK (eligible >= 0),
  total          bigint NOT NULL CHECK (total >= 0),
  eligible_total bigint NOT NULL CHECK (eligible_total >= 0),
  rules          jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS blat_snapshots_time_idx ON blat_snapshots (taken_at DESC);

-- one row per account that held $BLAT at that moment; deleting an account deletes its rows
CREATE TABLE IF NOT EXISTS blat_snapshot_rows (
  snapshot_id    uuid NOT NULL REFERENCES blat_snapshots(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  balance        integer NOT NULL CHECK (balance >= 0),
  earned         integer NOT NULL CHECK (earned >= 0),
  from_levels    bigint NOT NULL DEFAULT 0,
  from_referrals bigint NOT NULL DEFAULT 0,
  from_grants    bigint NOT NULL DEFAULT 0,
  ledger_sum     bigint NOT NULL,
  flag           text,
  eligible       boolean NOT NULL,
  reasons        text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, user_id)
);
CREATE INDEX IF NOT EXISTS blat_snapshot_rows_user_idx ON blat_snapshot_rows (user_id);
