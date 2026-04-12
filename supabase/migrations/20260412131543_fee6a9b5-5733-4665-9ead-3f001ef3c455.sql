
-- Prevent users from changing their own role via a trigger
CREATE OR REPLACE FUNCTION public.prevent_role_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If role is being changed and the user is updating their own profile
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() = NEW.id THEN
    NEW.role := OLD.role; -- silently revert the role change
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_self_update_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_update();
