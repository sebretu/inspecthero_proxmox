BEGIN;

ALTER TABLE public.task_photos
  ADD COLUMN IF NOT EXISTS photo_type TEXT CHECK (photo_type IN ('BEFORE', 'AFTER')) DEFAULT 'BEFORE';

UPDATE public.task_photos
SET photo_type = 'BEFORE'
WHERE photo_type IS NULL;

ALTER TABLE public.task_photos
  ALTER COLUMN photo_type SET NOT NULL;

COMMENT ON COLUMN public.task_photos.photo_type IS 'BEFORE = przed pracą, AFTER = po wykonaniu prac';

COMMIT;
