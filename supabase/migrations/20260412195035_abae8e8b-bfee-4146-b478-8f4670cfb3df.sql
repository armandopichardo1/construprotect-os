
-- Create audit log table
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  user_name TEXT,
  module TEXT NOT NULL,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  record_id TEXT,
  summary TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB
);

-- Index for fast queries
CREATE INDEX idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_module ON public.audit_log(module);
CREATE INDEX idx_audit_log_user_id ON public.audit_log(user_id);

-- Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit log"
ON public.audit_log FOR SELECT TO authenticated
USING (true);

CREATE POLICY "System can insert audit log"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (true);

-- Module mapping function
CREATE OR REPLACE FUNCTION public.get_module_for_table(tbl TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN tbl IN ('products', 'inventory', 'inventory_movements', 'shipments', 'shipment_items') THEN 'Inventario'
    WHEN tbl IN ('contacts', 'deals', 'activities', 'quotes', 'quote_items', 'client_projects', 'crm_clients', 'crm_opportunities') THEN 'CRM'
    WHEN tbl IN ('expenses', 'costs', 'sales', 'sale_items', 'journal_entries', 'journal_entry_lines') THEN 'Finanzas'
    WHEN tbl IN ('brands', 'suppliers', 'services', 'locations', 'chart_of_accounts') THEN 'Maestras'
    ELSE 'Sistema'
  END;
$$;

-- Summary builder function
CREATE OR REPLACE FUNCTION public.build_audit_summary(tbl TEXT, action TEXT, rec JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  label TEXT;
BEGIN
  -- Try to extract a human-readable label
  label := COALESCE(
    rec->>'name',
    rec->>'contact_name',
    rec->>'title',
    rec->>'description',
    rec->>'project_name',
    rec->>'sku',
    rec->>'quote_number',
    rec->>'invoice_ref',
    rec->>'po_number',
    rec->>'supplier_name',
    rec->>'competitor_name',
    rec->>'product_description',
    rec->>'key',
    LEFT(rec->>'id', 8)
  );

  RETURN CASE action
    WHEN 'create' THEN 'Creó ' || label
    WHEN 'update' THEN 'Editó ' || label
    WHEN 'delete' THEN 'Eliminó ' || label
    ELSE action || ' ' || label
  END;
END;
$$;

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action TEXT;
  _record JSONB;
  _old JSONB;
  _new JSONB;
  _record_id TEXT;
  _summary TEXT;
  _user_id UUID;
  _user_name TEXT;
BEGIN
  _user_id := auth.uid();

  -- Get user name
  SELECT full_name INTO _user_name FROM public.profiles WHERE id = _user_id;

  IF TG_OP = 'INSERT' THEN
    _action := 'create';
    _new := to_jsonb(NEW);
    _old := NULL;
    _record := _new;
    _record_id := _new->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'update';
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _record := _new;
    _record_id := _new->>'id';
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'delete';
    _old := to_jsonb(OLD);
    _new := NULL;
    _record := _old;
    _record_id := _old->>'id';
  END IF;

  _summary := public.build_audit_summary(TG_TABLE_NAME, _action, _record);

  INSERT INTO public.audit_log (user_id, user_name, module, table_name, action, record_id, summary, old_data, new_data)
  VALUES (_user_id, _user_name, public.get_module_for_table(TG_TABLE_NAME), TG_TABLE_NAME, _action, _record_id, _summary, _old, _new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers to all key tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'products', 'inventory_movements', 'shipments',
    'contacts', 'deals', 'activities', 'quotes', 'client_projects',
    'expenses', 'costs', 'sales', 'journal_entries',
    'brands', 'suppliers', 'services', 'locations',
    'competitor_entries', 'product_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      tbl, tbl
    );
  END LOOP;
END;
$$;
