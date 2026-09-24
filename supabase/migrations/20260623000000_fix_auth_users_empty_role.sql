-- 20260623000000_fix_auth_users_empty_role.sql
-- Fixes an issue where GoTrue (Supabase Auth) creates new users with an empty string ('') or NULL role,
-- causing database queries to fail with "role '' does not exist" under Row Level Security (RLS) checks.

-- 1. Ensure columns have the correct default
ALTER TABLE auth.users ALTER COLUMN role SET DEFAULT 'authenticated';

-- 2. Create the trigger function to automatically rewrite empty/null roles to 'authenticated'
CREATE OR REPLACE FUNCTION public.ensure_authenticated_role()
RETURNS trigger AS $$
BEGIN
  IF NEW.role IS NULL OR NEW.role = '' THEN
    NEW.role := 'authenticated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create BEFORE INSERT OR UPDATE trigger on auth.users
DROP TRIGGER IF EXISTS trg_ensure_authenticated_role ON auth.users;
CREATE TRIGGER trg_ensure_authenticated_role
BEFORE INSERT OR UPDATE OF role ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_authenticated_role();
