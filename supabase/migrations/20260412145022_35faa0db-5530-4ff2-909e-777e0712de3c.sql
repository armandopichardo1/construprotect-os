
-- Journal entries header
CREATE TABLE public.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_debit_usd numeric NOT NULL DEFAULT 0,
  total_credit_usd numeric NOT NULL DEFAULT 0,
  exchange_rate numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access journal_entries"
  ON public.journal_entries FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Journal entry lines
CREATE TABLE public.journal_entry_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  debit_usd numeric NOT NULL DEFAULT 0,
  credit_usd numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access journal_entry_lines"
  ON public.journal_entry_lines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_journal_entry_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entries_date ON public.journal_entries(date);
