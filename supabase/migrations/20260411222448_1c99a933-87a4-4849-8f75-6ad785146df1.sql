
-- Step 1: Drop old FK first so we can work freely
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_contact_id_fkey;

-- Step 2: Insert crm_clients into contacts where no match by name exists
INSERT INTO public.contacts (contact_name, company_name, phone, email, is_active)
SELECT c.name, c.company, c.phone, c.email, 
  CASE WHEN c.status = 'active' THEN true ELSE false END
FROM public.crm_clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.contacts ct 
  WHERE LOWER(TRIM(ct.contact_name)) = LOWER(TRIM(c.name))
);

-- Step 3: Update sales that reference crm_clients IDs to point to contacts
UPDATE public.sales s
SET contact_id = ct.id
FROM public.crm_clients c
JOIN public.contacts ct ON LOWER(TRIM(ct.contact_name)) = LOWER(TRIM(c.name))
WHERE s.contact_id = c.id;

-- Step 4: Set any orphaned contact_ids to NULL (sales pointing to neither table)
UPDATE public.sales s
SET contact_id = NULL
WHERE s.contact_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.contacts ct WHERE ct.id = s.contact_id);

-- Step 5: Make contact_id nullable temporarily for safety, then add FK
ALTER TABLE public.sales ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_contact_id_fkey 
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
