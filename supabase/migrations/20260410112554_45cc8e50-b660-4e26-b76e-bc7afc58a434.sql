
-- Create cost_category enum
CREATE TYPE public.cost_category AS ENUM (
  'freight', 'customs', 'raw_materials', 'packaging', 'labor', 'logistics', 'warehousing', 'insurance', 'other'
);

-- Create costs table mirroring expenses structure
CREATE TABLE public.costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  category public.cost_category NOT NULL DEFAULT 'other',
  vendor TEXT,
  amount_usd NUMERIC NOT NULL DEFAULT 0,
  amount_dop NUMERIC NOT NULL DEFAULT 0,
  exchange_rate NUMERIC,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  receipt_url TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT,
  subcategory TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Authenticated full access costs"
ON public.costs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
