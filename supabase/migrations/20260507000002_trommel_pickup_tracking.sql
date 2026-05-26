-- ADD picked_up_at and pickup_email_sent to trommels
ALTER TABLE public.trommels
  ADD COLUMN IF NOT EXISTS pickup_requested_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pickup_requested_email_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pickup_email_sent boolean DEFAULT false;
