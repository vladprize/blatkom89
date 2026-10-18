-- Indexes for foreign-key actions and the retention job (docs/PRIVACY.md §2.2–2.3).
-- Without them, deleting a session (retention purge, account deletion) would scan the whole
-- analytics_events table to apply ON DELETE SET NULL, and account deletion would scan app_errors.

CREATE INDEX analytics_events_session_idx ON analytics_events (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX app_errors_user_idx ON app_errors (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX invitations_created_by_idx ON invitations (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);

-- Append-mostly, time-ordered table: a BRIN index lets the daily purge find old rows cheaply
-- without the write cost of another B-tree (metric queries use (name, occurred_at)).
CREATE INDEX analytics_events_occurred_brin ON analytics_events USING brin (occurred_at);
