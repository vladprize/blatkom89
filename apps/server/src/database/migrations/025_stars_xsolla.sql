-- v0.2.18 part 3: BLATS for Telegram Stars (inside the Mini App) and through Xsolla (on the website).
-- Adds only: existing payments keep their rows; the provider check is widened to the new provider.
--
--   stars       — the price in Telegram Stars (XTR) of a Stars payment, as invoiced
--   charge_ref  — the provider's own id of the money movement: Telegram's telegram_payment_charge_id
--                 (needed to refund it), Xsolla's order id is kept in provider_ref as before
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'payments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%provider%' LOOP
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', c.conname);
  END LOOP; END $$;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('stripe', 'nowpayments', 'telegram', 'xsolla'));
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stars integer CHECK (stars IS NULL OR stars > 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS charge_ref text CHECK (charge_ref IS NULL OR char_length(charge_ref) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX IF NOT EXISTS payments_charge_ref_idx ON payments (provider, charge_ref) WHERE charge_ref IS NOT NULL;
