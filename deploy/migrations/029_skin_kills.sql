-- v0.2.23: the kill counter of the legendary skins («★ 128» on the weapon in the fighter cards). Adds a
-- table only; nothing existing is changed or removed.
--
-- One row per player and skin (weapon + finish): the eliminations made with that weapon while it wore that
-- finish, in matches online. Added once per match, in the same transaction that files the match's results
-- (matches.results_processed_at keeps a retried result from counting twice).
CREATE TABLE IF NOT EXISTS skin_kills (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon     text        NOT NULL,
  finish     text        NOT NULL,
  kills      integer     NOT NULL DEFAULT 0 CHECK (kills >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weapon, finish)
);
