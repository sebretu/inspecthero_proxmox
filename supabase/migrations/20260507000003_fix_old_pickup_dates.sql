-- Fix old picked_up trommels to have a date
UPDATE public.trommels
SET picked_up_at = updated_at
WHERE status = 'picked_up' AND picked_up_at IS NULL;

-- Fix old pickup_requested trommels to have a date
UPDATE public.trommels
SET pickup_requested_at = updated_at
WHERE status = 'pickup_requested' AND pickup_requested_at IS NULL;
