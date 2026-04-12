
CREATE TABLE public.physical_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name text,
  notes text,
  total_products_counted integer NOT NULL DEFAULT 0,
  total_differences integer NOT NULL DEFAULT 0,
  total_surplus integer NOT NULL DEFAULT 0,
  total_shortfall integer NOT NULL DEFAULT 0,
  surplus_value_usd numeric NOT NULL DEFAULT 0,
  shortfall_value_usd numeric NOT NULL DEFAULT 0,
  net_adjustment_value_usd numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.physical_count_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  physical_count_id uuid NOT NULL REFERENCES public.physical_counts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  system_qty integer NOT NULL DEFAULT 0,
  counted_qty integer NOT NULL DEFAULT 0,
  difference integer NOT NULL DEFAULT 0,
  unit_cost_usd numeric NOT NULL DEFAULT 0,
  adjustment_value_usd numeric NOT NULL DEFAULT 0
);

ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access physical_counts" ON public.physical_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access physical_count_items" ON public.physical_count_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_physical_count_items_count_id ON public.physical_count_items(physical_count_id);
