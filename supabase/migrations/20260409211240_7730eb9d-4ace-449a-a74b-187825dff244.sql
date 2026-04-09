
-- Enums
CREATE TYPE public.deal_stage AS ENUM (
  'prospecting','initial_contact','demo_sample','quote_sent','negotiation','closing','won','lost'
);

CREATE TYPE public.activity_type AS ENUM (
  'call','whatsapp','email','visit','meeting','demo','sample_sent','quote_sent','follow_up','note','delivery'
);

CREATE TYPE public.quote_status AS ENUM (
  'draft','sent','accepted','rejected','expired'
);

-- contacts
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  contact_name text NOT NULL,
  rnc text,
  email text,
  phone text,
  whatsapp text,
  segment text,
  priority integer DEFAULT 3,
  territory text,
  address text,
  source text,
  price_tier text DEFAULT 'list',
  lifetime_revenue_usd numeric DEFAULT 0,
  total_orders integer DEFAULT 0,
  last_order_date date,
  last_activity_date timestamptz,
  tags text[] DEFAULT '{}',
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access contacts" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- deals
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  stage deal_stage NOT NULL DEFAULT 'prospecting',
  value_usd numeric DEFAULT 0,
  probability integer DEFAULT 50,
  expected_close_date date,
  actual_close_date date,
  loss_reason text,
  assigned_to uuid,
  products_of_interest jsonb DEFAULT '[]',
  project_name text,
  project_size_m2 numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access deals" ON public.deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- activities
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  completed_at timestamptz,
  is_completed boolean DEFAULT false,
  outcome text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access activities" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- quotes
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  status quote_status NOT NULL DEFAULT 'draft',
  subtotal_usd numeric DEFAULT 0,
  itbis_usd numeric DEFAULT 0,
  total_usd numeric DEFAULT 0,
  total_dop numeric DEFAULT 0,
  exchange_rate numeric,
  valid_until date,
  notes text,
  created_by uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access quotes" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- quote_items
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_usd numeric NOT NULL DEFAULT 0,
  discount_pct numeric DEFAULT 0,
  line_total_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access quote_items" ON public.quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
