ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'pct'
CHECK (discount_type IN ('pct', 'amount'));