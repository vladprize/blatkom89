-- БЛАТКОМ ’89 — initial schema.
-- Canonical data: users, profiles, sessions, matches, match_participants, player_achievements,
-- analytics_events, app_errors, invitations, admin_*. Derived metrics are computed by queries
-- (see docs/ANALYTICS.md); user_daily_activity is a de-duplicated activity index.

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id      bigint UNIQUE,
  dev_device_id    text UNIQUE,
  display_name     text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
  language_code    text,
  platform         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CHECK (telegram_id IS NOT NULL OR dev_device_id IS NOT NULL OR deleted_at IS NOT NULL)
);
CREATE INDEX users_created_at_idx ON users (created_at);
CREATE INDEX users_last_seen_idx ON users (last_seen_at);
CREATE INDEX users_display_name_idx ON users (lower(display_name));

CREATE TABLE profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level               int NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp                  int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  matches_played      int NOT NULL DEFAULT 0,
  matches_completed   int NOT NULL DEFAULT 0,
  wins                int NOT NULL DEFAULT 0,
  losses              int NOT NULL DEFAULT 0,
  kills               int NOT NULL DEFAULT 0,
  deaths              int NOT NULL DEFAULT 0,
  playtime_sec        int NOT NULL DEFAULT 0,
  current_win_streak  int NOT NULL DEFAULT 0,
  best_win_streak     int NOT NULL DEFAULT 0,
  preferred_character text CHECK (preferred_character IN ('petya', 'valuta', 'uchastkovy', 'mihalych')),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     bytea NOT NULL UNIQUE,
  method         text NOT NULL CHECK (method IN ('telegram', 'dev')),
  platform       text,
  client_version text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE user_daily_activity (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day           date NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX user_daily_activity_day_idx ON user_daily_activity (day);

CREATE TABLE matches (
  id                   uuid PRIMARY KEY,
  room_id              text NOT NULL,
  map_id               text NOT NULL CHECK (map_id IN ('factory', 'garages', 'yard')),
  is_private           boolean NOT NULL DEFAULT false,
  status               text NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at           timestamptz NOT NULL,
  ended_at             timestamptz,
  duration_ms          int CHECK (duration_ms >= 0),
  end_reason           text,
  player_count         int NOT NULL DEFAULT 0,
  results_processed_at timestamptz
);
CREATE INDEX matches_started_idx ON matches (started_at);
CREATE INDEX matches_status_idx ON matches (status);

CREATE TABLE match_participants (
  match_id     uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character    text NOT NULL CHECK (character IN ('petya', 'valuta', 'uchastkovy', 'mihalych')),
  place        int,
  kills        int NOT NULL DEFAULT 0,
  deaths       int NOT NULL DEFAULT 0,
  score        int NOT NULL DEFAULT 0,
  damage_dealt int NOT NULL DEFAULT 0,
  completed    boolean NOT NULL DEFAULT false,
  won          boolean NOT NULL DEFAULT false,
  via_invite   boolean NOT NULL DEFAULT false,
  xp_awarded   int NOT NULL DEFAULT 0,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX match_participants_user_idx ON match_participants (user_id, joined_at DESC);

CREATE TABLE achievements (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  description text NOT NULL,
  xp_reward   int NOT NULL DEFAULT 0
);

CREATE TABLE player_achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements(id),
  match_id       uuid REFERENCES matches(id) ON DELETE SET NULL,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE invitations (
  code       text PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9]{6,16}$'),
  room_id    text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  opened     int NOT NULL DEFAULT 0
);
CREATE INDEX invitations_room_idx ON invitations (room_id);

CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  source      text NOT NULL CHECK (source IN ('client', 'server')),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES sessions(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  platform    text,
  props       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX analytics_events_name_time_idx ON analytics_events (name, occurred_at);
CREATE INDEX analytics_events_user_time_idx ON analytics_events (user_id, occurred_at);

CREATE TABLE app_errors (
  id             bigserial PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  source         text NOT NULL CHECK (source IN ('client', 'server')),
  component      text NOT NULL,
  category       text NOT NULL,
  message        text NOT NULL,
  fingerprint    text NOT NULL,
  client_version text,
  server_version text,
  session_id     uuid,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX app_errors_time_idx ON app_errors (occurred_at);
CREATE INDEX app_errors_fingerprint_idx ON app_errors (fingerprint);

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.-]{3,32}$'),
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  disabled_at   timestamptz
);

CREATE TABLE admin_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  csrf_hash  bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip         text,
  user_agent text
);

CREATE TABLE admin_audit_log (
  id         bigserial PRIMARY KEY,
  admin_id   uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target     text,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_time_idx ON admin_audit_log (created_at);
