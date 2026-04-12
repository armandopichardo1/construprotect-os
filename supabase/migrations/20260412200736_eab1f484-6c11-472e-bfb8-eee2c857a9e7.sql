
ALTER TABLE public.exchange_rates DROP CONSTRAINT exchange_rates_source_check;
ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_source_check CHECK (source = ANY (ARRAY['bancentral', 'manual', 'histórico']));

INSERT INTO public.exchange_rates (date, usd_buy, usd_sell, source) VALUES
  ('2025-01-01', 57.20, 57.85, 'manual'),
  ('2025-02-01', 57.35, 58.00, 'manual'),
  ('2025-03-01', 57.50, 58.15, 'manual'),
  ('2025-04-01', 57.60, 58.25, 'manual'),
  ('2025-05-01', 57.70, 58.35, 'manual'),
  ('2025-06-01', 57.80, 58.45, 'manual'),
  ('2025-07-01', 57.85, 58.50, 'manual'),
  ('2025-08-01', 57.90, 58.55, 'manual'),
  ('2025-09-01', 57.95, 58.60, 'manual'),
  ('2025-10-01', 58.00, 58.65, 'manual'),
  ('2025-11-01', 58.05, 58.70, 'manual'),
  ('2025-12-01', 58.10, 58.75, 'manual'),
  ('2026-01-01', 58.15, 58.80, 'manual'),
  ('2026-02-01', 58.20, 58.85, 'manual'),
  ('2026-03-01', 58.25, 58.90, 'manual');
