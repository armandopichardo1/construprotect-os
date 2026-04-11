
CREATE OR REPLACE FUNCTION public.prevent_account_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_id uuid;
BEGIN
  -- Allow null parent (root account)
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cannot be your own parent
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Una cuenta no puede ser su propia cuenta madre';
  END IF;

  -- Walk up the ancestor chain from parent_id to detect cycles
  current_id := NEW.parent_id;
  WHILE current_id IS NOT NULL LOOP
    SELECT parent_id INTO current_id
    FROM public.chart_of_accounts
    WHERE id = current_id;

    IF current_id = NEW.id THEN
      RAISE EXCEPTION 'Referencia circular detectada: la cuenta madre seleccionada es descendiente de esta cuenta';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_account_cycle
BEFORE INSERT OR UPDATE ON public.chart_of_accounts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_account_cycle();
