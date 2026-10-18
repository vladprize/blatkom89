-- Guest accounts for the public website (players without Telegram): sessions may be issued with
-- method 'guest'. Guest users are keyed by an HMAC of a random device secret kept in the browser
-- (users.dev_device_id = 'g1:' || base64url(HMAC-SHA-256(SESSION_SECRET, deviceId))).
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_method_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_method_check CHECK (method IN ('telegram', 'dev', 'guest'));
