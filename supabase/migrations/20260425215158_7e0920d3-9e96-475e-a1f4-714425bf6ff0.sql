ALTER TABLE public.discount_rules
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'pct'
    CHECK (discount_type IN ('pct', 'amount')),
  ADD COLUMN IF NOT EXISTS discount_amount_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS name text;