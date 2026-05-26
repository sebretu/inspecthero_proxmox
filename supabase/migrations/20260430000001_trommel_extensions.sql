-- =============================================================================
-- TROMMEL EXTENSIONS — photo, company info, serial number
-- CABLE ROUTES EXTENSIONS — waypoints for route path editing
-- =============================================================================

-- ── TROMMELS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.trommels
  ADD COLUMN IF NOT EXISTS photo_url    text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS serial_number text;

-- ── CABLE ROUTES ─────────────────────────────────────────────────────────────
-- waypoints: array of intermediate points [{x: number, y: number}]
-- stored as normalized coords (0-1 range, same as point_a/b)
ALTER TABLE public.cable_routes
  ADD COLUMN IF NOT EXISTS waypoints jsonb;

-- ── STORAGE BUCKET for trommel photos ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('trommel-photos', 'trommel-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "trommel_photos_insert" ON storage.objects;
CREATE POLICY "trommel_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'trommel-photos');

-- Allow public read
DROP POLICY IF EXISTS "trommel_photos_select" ON storage.objects;
CREATE POLICY "trommel_photos_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'trommel-photos');

-- Allow authenticated users to delete their own uploads
DROP POLICY IF EXISTS "trommel_photos_delete" ON storage.objects;
CREATE POLICY "trommel_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'trommel-photos');
