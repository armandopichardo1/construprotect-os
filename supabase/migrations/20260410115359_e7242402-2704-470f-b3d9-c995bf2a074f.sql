
CREATE TABLE public.alert_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_count INTEGER NOT NULL DEFAULT 1,
  fired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access alert_history"
  ON public.alert_history
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_alert_history_fired_at ON public.alert_history (fired_at DESC);
CREATE INDEX idx_alert_history_rule_id ON public.alert_history (rule_id);
