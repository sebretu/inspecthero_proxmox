-- Add photo_url to employees and profiles
alter table public.employees add column if not exists photo_url text;
alter table public.profiles add column if not exists photo_url text;

-- Add RLS for employees photo_url (already handled by employees_admin_all, but making sure)
-- STORAGE: ensure bucket 'employee-photos' exists and is public
-- (Note: can't create buckets via SQL easily, but assuming storage is handled via API/Admin)
