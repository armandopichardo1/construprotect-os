
-- Expense categories enum
CREATE TYPE public.expense_category AS ENUM (
  'warehouse', 'software', 'accounting', 'marketing', 'shipping',
  'customs', 'travel', 'samples', 'office', 'bank_fees', 'other'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending', 'paid', 'partial', 'overdue', 'cancelled'
);

-- Expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL DEFAULT 'other',
  subcategory TEXT,
  description TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL DEFAULT 0,
  amount_dop NUMERIC NOT NULL DEFAULT 0,
  exchange_rate NUMERIC,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT,
  receipt_url TEXT,
  vendor TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access expenses"
ON public.expenses FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Sales table
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_id UUID REFERENCES public.crm_clients(id),
  deal_id UUID REFERENCES public.crm_opportunities(id),
  invoice_ref TEXT,
  subtotal_usd NUMERIC NOT NULL DEFAULT 0,
  itbis_usd NUMERIC NOT NULL DEFAULT 0,
  total_usd NUMERIC NOT NULL DEFAULT 0,
  total_dop NUMERIC NOT NULL DEFAULT 0,
  exchange_rate NUMERIC,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  payment_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access sales"
ON public.sales FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Sale items table
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_usd NUMERIC NOT NULL DEFAULT 0,
  unit_cost_usd NUMERIC NOT NULL DEFAULT 0,
  line_total_usd NUMERIC NOT NULL DEFAULT 0,
  margin_pct NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access sale_items"
ON public.sale_items FOR ALL TO authenticated
USING (true) WITH CHECK (true);
