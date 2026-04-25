-- Add explicit discount tracking to sale_items for audit/accounting
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_unit_price_usd numeric NOT NULL DEFAULT 0;

-- Backfill historic data: infer gross from products.price_list_usd when greater than sold net price
UPDATE public.sale_items si
SET 
  gross_unit_price_usd = GREATEST(COALESCE(p.price_list_usd, 0), si.unit_price_usd),
  discount_amount_usd = GREATEST(0, GREATEST(COALESCE(p.price_list_usd, 0), si.unit_price_usd) - si.unit_price_usd) * si.quantity,
  discount_pct = CASE 
    WHEN GREATEST(COALESCE(p.price_list_usd, 0), si.unit_price_usd) > 0 
    THEN ROUND(((GREATEST(COALESCE(p.price_list_usd, 0), si.unit_price_usd) - si.unit_price_usd) / GREATEST(COALESCE(p.price_list_usd, 0), si.unit_price_usd))::numeric * 100, 2)
    ELSE 0 
  END
FROM public.products p
WHERE si.product_id = p.id
  AND si.gross_unit_price_usd = 0;

-- For items without product reference, set gross = net (no discount)
UPDATE public.sale_items
SET gross_unit_price_usd = unit_price_usd
WHERE gross_unit_price_usd = 0;