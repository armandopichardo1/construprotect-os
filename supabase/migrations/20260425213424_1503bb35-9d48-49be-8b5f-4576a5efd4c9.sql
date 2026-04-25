-- Discount rules: per-client, per-category, or both
CREATE TABLE public.discount_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  category TEXT,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  -- At least one dimension must be set
  CONSTRAINT discount_rules_dimension_chk CHECK (
    contact_id IS NOT NULL OR category IS NOT NULL
  ),
  CONSTRAINT discount_rules_pct_chk CHECK (discount_pct >= 0 AND discount_pct <= 100)
);

-- Prevent duplicate combinations
CREATE UNIQUE INDEX discount_rules_unique_combo
  ON public.discount_rules (
    COALESCE(contact_id::text, ''),
    COALESCE(category, '')
  );

CREATE INDEX discount_rules_contact_idx ON public.discount_rules (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX discount_rules_category_idx ON public.discount_rules (category) WHERE category IS NOT NULL;

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access discount_rules"
  ON public.discount_rules
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_discount_rules_updated_at
  BEFORE UPDATE ON public.discount_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE TRIGGER audit_discount_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.discount_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_fn();