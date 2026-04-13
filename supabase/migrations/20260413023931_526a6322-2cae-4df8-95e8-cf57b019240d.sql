
-- Add columns
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS financial_statement text,
  ADD COLUMN IF NOT EXISTS normal_balance text;

-- Populate based on account_type
UPDATE public.chart_of_accounts SET
  financial_statement = CASE
    WHEN account_type IN ('Activo', 'Pasivo', 'Capital') THEN 'Balance General'
    WHEN account_type IN ('Ingreso', 'Ingresos No Operacionales', 'Costo', 'Gasto', 'Gastos No Operacionales') THEN 'Estado de Resultados'
    ELSE 'Sin asignar'
  END,
  normal_balance = CASE
    WHEN account_type IN ('Activo', 'Costo', 'Gasto', 'Gastos No Operacionales') THEN 'Débito'
    WHEN account_type IN ('Pasivo', 'Capital', 'Ingreso', 'Ingresos No Operacionales') THEN 'Crédito'
    ELSE 'Sin asignar'
  END
WHERE financial_statement IS NULL OR normal_balance IS NULL;
