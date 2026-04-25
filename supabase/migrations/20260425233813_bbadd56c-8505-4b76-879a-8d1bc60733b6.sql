ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id text;

CREATE INDEX IF NOT EXISTS idx_journal_entries_reference
  ON public.journal_entries (reference_type, reference_id);