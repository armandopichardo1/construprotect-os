-- History table to track edits of shipment expenses (freight/customs/other)
CREATE TABLE public.shipment_expense_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL,
  changed_by UUID,
  changed_by_name TEXT,
  previous_freight_usd NUMERIC NOT NULL DEFAULT 0,
  previous_customs_usd NUMERIC NOT NULL DEFAULT 0,
  previous_other_usd NUMERIC NOT NULL DEFAULT 0,
  new_freight_usd NUMERIC NOT NULL DEFAULT 0,
  new_customs_usd NUMERIC NOT NULL DEFAULT 0,
  new_other_usd NUMERIC NOT NULL DEFAULT 0,
  delta_total_usd NUMERIC NOT NULL DEFAULT 0,
  payment_mode TEXT,
  journal_entry_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipment_expense_history_shipment ON public.shipment_expense_history(shipment_id, created_at DESC);

ALTER TABLE public.shipment_expense_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access shipment_expense_history"
  ON public.shipment_expense_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);