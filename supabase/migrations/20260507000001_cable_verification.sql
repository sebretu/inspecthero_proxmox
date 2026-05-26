-- Add is_verified column to cables table
alter table public.cables add column if not exists is_verified boolean not null default false;
