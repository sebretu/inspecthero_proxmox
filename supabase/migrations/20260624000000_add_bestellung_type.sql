-- Alter check constraint on public.aufmass_sessions to allow 'bestellung'
ALTER TABLE public.aufmass_sessions DROP CONSTRAINT IF EXISTS aufmass_sessions_session_type_check;
ALTER TABLE public.aufmass_sessions ADD CONSTRAINT aufmass_sessions_session_type_check CHECK (session_type IN ('aufmass', 'zusatz', 'baubehinderung', 'bestellung'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
