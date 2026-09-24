-- Migration: create current_company_id() helper for RLS
-- Allows RLS policies to extract company_id from JWT claims

create or replace function public.current_company_id()
returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'company_id', '')::uuid
$$ language sql stable;
