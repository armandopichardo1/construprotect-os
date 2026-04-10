
-- Add 'delivered' to deal_stage enum
ALTER TYPE public.deal_stage ADD VALUE IF NOT EXISTS 'delivered' BEFORE 'won';

-- Add missing columns to deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS project_location text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;

-- Add missing columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS additional_costs_usd numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS taxes_per_unit_usd numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text;

-- Create shipment_status enum
DO $$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM ('ordered', 'in_transit', 'customs', 'warehouse', 'received');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create shipments table
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_name text NOT NULL,
  po_number text,
  status public.shipment_status NOT NULL DEFAULT 'ordered',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  estimated_arrival date,
  actual_arrival date,
  total_cost_usd numeric DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access shipments" ON public.shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create shipment_items table
CREATE TABLE IF NOT EXISTS public.shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  quantity_ordered integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  unit_cost_usd numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access shipment_items" ON public.shipment_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create project_status enum
DO $$ BEGIN
  CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create client_projects table
CREATE TABLE IF NOT EXISTS public.client_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id),
  project_name text NOT NULL,
  location text,
  area_m2 numeric,
  status public.project_status NOT NULL DEFAULT 'planning',
  estimated_value_usd numeric DEFAULT 0,
  product_needs jsonb DEFAULT '[]'::jsonb,
  start_date date,
  end_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access client_projects" ON public.client_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_client_projects_updated_at BEFORE UPDATE ON public.client_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create request_status enum
DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending', 'sourcing', 'available', 'declined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create product_requests table
CREATE TABLE IF NOT EXISTS public.product_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_contact_id uuid REFERENCES public.contacts(id),
  product_description text NOT NULL,
  category text,
  priority integer DEFAULT 3,
  status public.request_status NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access product_requests" ON public.product_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_product_requests_updated_at BEFORE UPDATE ON public.product_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for shipments
ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;

-- Create trigger function for sale inventory auto-deduction
CREATE OR REPLACE FUNCTION public.handle_sale_item_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct from inventory
  UPDATE public.inventory
  SET quantity_on_hand = quantity_on_hand - NEW.quantity,
      updated_at = now()
  WHERE product_id = NEW.product_id;

  -- Create inventory movement record
  INSERT INTO public.inventory_movements (product_id, quantity, movement_type, unit_cost_usd, reference_id, reference_type, notes)
  VALUES (NEW.product_id, -NEW.quantity, 'sale', NEW.unit_cost_usd, NEW.sale_id, 'sale', 'Auto-deducción por venta');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_item_deduct_inventory
AFTER INSERT ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_sale_item_inventory();
