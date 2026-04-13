
-- Create shipment_payments table for partial payment tracking
CREATE TABLE public.shipment_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  amount_usd numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shipment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access shipment_payments"
ON public.shipment_payments FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- Add amount_paid_usd to shipments to track cumulative payments
ALTER TABLE public.shipments
  ADD COLUMN amount_paid_usd numeric NOT NULL DEFAULT 0;
