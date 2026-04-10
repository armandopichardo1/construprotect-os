ALTER TABLE public.expenses
ADD COLUMN account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;