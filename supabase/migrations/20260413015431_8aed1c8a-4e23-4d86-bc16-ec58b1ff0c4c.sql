
-- Add payment tracking columns to shipments
ALTER TABLE public.shipments
  ADD COLUMN payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN payment_date date,
  ADD COLUMN payment_account_id uuid REFERENCES public.chart_of_accounts(id);
