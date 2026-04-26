ALTER TABLE public.shipment_expense_history
ADD COLUMN IF NOT EXISTS reversed_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS reversed_by uuid NULL,
ADD COLUMN IF NOT EXISTS reversed_by_name text NULL,
ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid NULL,
ADD COLUMN IF NOT EXISTS reversal_of_history_id uuid NULL,
ADD COLUMN IF NOT EXISTS adjustment_type text NULL DEFAULT 'edit';

CREATE INDEX IF NOT EXISTS idx_shipment_expense_history_shipment ON public.shipment_expense_history(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_expense_history_reversed ON public.shipment_expense_history(reversed_at);

COMMENT ON COLUMN public.shipment_expense_history.adjustment_type IS 'edit | historical_adjustment | reversal';
COMMENT ON COLUMN public.shipment_expense_history.reversal_of_history_id IS 'When this row is a reversal, points to the original history row being reversed';