-- v0.2.25: BLATS for invitations, on top of the talons — a friend's third whole online match pays the inviter
-- once (the server's REFERRAL_BLATS* settings), at most a number of friends a month. Invitations made before
-- this release keep what they paid ('legacy': no BLATS); nothing existing is changed or dropped.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS blats_status text;
UPDATE referrals SET blats_status = 'legacy' WHERE blats_status IS NULL;
ALTER TABLE referrals ALTER COLUMN blats_status SET DEFAULT 'pending';
ALTER TABLE referrals ALTER COLUMN blats_status SET NOT NULL;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_blats_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_blats_status_check CHECK (blats_status IN ('pending', 'paid', 'capped', 'held', 'rejected', 'legacy'));
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS blats_reward integer NOT NULL DEFAULT 0;
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_blats_reward_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_blats_reward_check CHECK (blats_reward >= 0);
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS blats_at timestamptz;
CREATE INDEX IF NOT EXISTS referrals_blats_idx ON referrals (referrer_id, blats_status, blats_at);
-- one BLATS credit per invited friend, ever (retries and concurrent matches included); no such rows exist yet
CREATE UNIQUE INDEX IF NOT EXISTS currency_ledger_referral_diamonds_once ON currency_ledger (user_id, ref) WHERE currency = 'diamonds' AND reason = 'referral';
