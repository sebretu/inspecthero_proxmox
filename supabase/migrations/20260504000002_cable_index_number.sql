-- Add index_number to cables for unique identification
ALTER TABLE public.cables ADD COLUMN IF NOT EXISTS index_number INTEGER;

-- Backfill existing cables
DO $$
DECLARE
    r RECORD;
    curr_nr INTEGER := 1;
BEGIN
    FOR r IN (SELECT id FROM public.cables WHERE index_number IS NULL ORDER BY created_at) LOOP
        -- find smallest available
        WHILE EXISTS (SELECT 1 FROM public.cables WHERE index_number = curr_nr) LOOP
            curr_nr := curr_nr + 1;
        END LOOP;
        UPDATE public.cables SET index_number = curr_nr WHERE id = r.id;
        curr_nr := curr_nr + 1;
    END LOOP;
END $$;

-- Allow anonymous users to search cables by index_number (for public search popup)
DROP POLICY IF EXISTS "cables_public_search" ON public.cables;
CREATE POLICY "cables_public_search" ON public.cables
  FOR SELECT TO anon
  USING (true);

-- Also allow anonymous users to see trommels for general info if needed
DROP POLICY IF EXISTS "trommels_public_search" ON public.trommels;
CREATE POLICY "trommels_public_search" ON public.trommels
  FOR SELECT TO anon
  USING (true);

