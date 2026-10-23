-- V2.0 part F: where players come from (the first touch) and partner links for authors and streamers —
-- measuring only: no payouts, no rewards, nothing a partner earns (docs/ANALYTICS.md §6).
--
-- * partners — an administrator's list of partner links (`?p=<code>` on the website, `start=p_<code>` in
--   the bot); a code is lower-case letters, digits and `_`.
-- * visitors.utm_* / partner_id — what the browser's first visit carried (kept as it was first seen).
-- * users.source_channel / source_detail / partner_id — how a new account came: a partner's link, a
--   player's referral link, a room invitation, a campaign (utm_source), another site, Telegram, or direct;
--   set once, when the account is made (accounts made before this release stay unknown).
--
-- Only new tables and columns; nothing existing is changed.
CREATE TABLE IF NOT EXISTS partners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{3,24}$'),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  note       text CHECK (note IS NULL OR char_length(note) <= 300),
  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE visitors ADD COLUMN IF NOT EXISTS utm_source text CHECK (utm_source IS NULL OR char_length(utm_source) <= 64);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS utm_medium text CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 64);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS utm_campaign text CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 64);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS visitors_partner_idx ON visitors (partner_id, first_seen_at) WHERE partner_id IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS source_channel text CHECK (source_channel IS NULL OR source_channel IN ('partner', 'referral', 'invite', 'utm', 'referrer', 'telegram', 'direct'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS source_detail text CHECK (source_detail IS NULL OR char_length(source_detail) <= 80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_partner_idx ON users (partner_id, created_at) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_source_idx ON users (source_channel, created_at);
