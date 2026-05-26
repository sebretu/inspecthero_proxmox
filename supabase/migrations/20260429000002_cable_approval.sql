-- Add pending_approval status to cable_status enum
ALTER TYPE public.cable_status ADD VALUE IF NOT EXISTS 'pending_approval' AFTER 'in_progress';

-- Add reported_by to cables for tracking who submitted for approval
ALTER TABLE public.cables
  ADD COLUMN IF NOT EXISTS reported_by uuid references public.profiles(id) on delete set null;
