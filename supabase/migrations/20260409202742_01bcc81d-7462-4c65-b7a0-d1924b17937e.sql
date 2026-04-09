
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access locations" ON public.locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  unit_cost_usd NUMERIC(12,2) DEFAULT 0,
  total_unit_cost_usd NUMERIC(12,2) DEFAULT 0,
  price_list_usd NUMERIC(12,2) DEFAULT 0,
  price_architect_usd NUMERIC(12,2) DEFAULT 0,
  price_project_usd NUMERIC(12,2) DEFAULT 0,
  price_wholesale_usd NUMERIC(12,2) DEFAULT 0,
  margin_list_pct NUMERIC(5,2) DEFAULT 0,
  margin_architect_pct NUMERIC(5,2) DEFAULT 0,
  margin_project_pct NUMERIC(5,2) DEFAULT 0,
  margin_wholesale_pct NUMERIC(5,2) DEFAULT 0,
  coverage_m2 NUMERIC(10,2),
  dimensions TEXT,
  units_per_pack INTEGER DEFAULT 1,
  reorder_point INTEGER DEFAULT 10,
  reorder_qty INTEGER DEFAULT 50,
  lead_time_days INTEGER DEFAULT 21,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TYPE public.movement_type AS ENUM ('receipt', 'sale', 'adjustment', 'sample', 'return', 'damage');

CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type public.movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  unit_cost_usd NUMERIC(12,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access movements" ON public.inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  usd_buy NUMERIC(10,4) NOT NULL,
  usd_sell NUMERIC(10,4) NOT NULL,
  source TEXT DEFAULT 'manual' CHECK (source IN ('bancentral', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access exchange_rates" ON public.exchange_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
