-- Add structured "other costs" column to shipments
ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS other_cost_usd NUMERIC NOT NULL DEFAULT 0;

-- Backfill from existing notes pattern: "Otros $123.45"
UPDATE public.shipments
SET other_cost_usd = COALESCE(
  NULLIF(substring(notes from 'Otros\s*\$([0-9]+(?:\.[0-9]+)?)'), '')::numeric,
  0
)
WHERE other_cost_usd = 0
  AND notes ~ 'Otros\s*\$[0-9]';