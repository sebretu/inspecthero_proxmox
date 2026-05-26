DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'user_role' AND e.enumlabel = 'MOD') THEN
    ALTER TYPE public.user_role ADD VALUE 'MOD';
  END IF;
END $$;
