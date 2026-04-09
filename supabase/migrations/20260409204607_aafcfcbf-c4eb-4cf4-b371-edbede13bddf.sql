
-- CRM Clients table
CREATE TABLE public.crm_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'prospect',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access crm_clients"
ON public.crm_clients FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_crm_clients_updated_at
BEFORE UPDATE ON public.crm_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pipeline stage enum
CREATE TYPE public.pipeline_stage AS ENUM (
  'prospecto', 'contactado', 'cotizado', 'negociacion', 'cerrado_ganado', 'cerrado_perdido'
);

-- CRM Opportunities table
CREATE TABLE public.crm_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage pipeline_stage NOT NULL DEFAULT 'prospecto',
  value_usd NUMERIC NOT NULL DEFAULT 0,
  probability_pct INTEGER DEFAULT 50,
  expected_close_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access crm_opportunities"
ON public.crm_opportunities FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER update_crm_opportunities_updated_at
BEFORE UPDATE ON public.crm_opportunities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
