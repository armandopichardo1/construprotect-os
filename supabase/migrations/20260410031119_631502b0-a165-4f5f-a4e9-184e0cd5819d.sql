
CREATE TABLE public.competitor_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  product_category TEXT,
  price_usd NUMERIC,
  our_price_usd NUMERIC,
  notes TEXT,
  source TEXT,
  spotted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.competitor_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access competitor_entries"
ON public.competitor_entries
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
