BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-photos', 'task-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

COMMIT;
