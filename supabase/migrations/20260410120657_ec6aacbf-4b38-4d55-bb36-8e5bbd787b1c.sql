ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS cbm_per_unit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weight_kg_per_unit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_qty integer DEFAULT 1;