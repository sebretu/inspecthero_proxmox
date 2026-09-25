-- RLS policies for building-task-manager
-- Run these in Supabase SQL editor for your project (adjust schema/names if needed)

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

-- profiles: user can see their profile; company members can select; users can update own profile
CREATE POLICY profiles_select_self_or_company
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- tasks: creator, assignee, or same company can read; create allowed if created_by = auth.uid(); update allowed only by allowed actors
CREATE POLICY tasks_select_allowed
  ON public.tasks FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY tasks_insert_owner
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY tasks_update_allowed
  ON public.tasks FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- task_photos: allow SELECT for authenticated users
CREATE POLICY task_photos_select_allowed
  ON public.task_photos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY task_photos_insert_allowed
  ON public.task_photos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Storage objects policy for bucket "task-photos"
-- Allow public read of all objects in task-photos bucket
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop the old restrictive policy
DROP POLICY IF EXISTS storage_objects_select_task_photos ON storage.objects;

-- Create new policy allowing public read of task-photos bucket
CREATE POLICY storage_objects_select_task_photos
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-photos');

-- Allow DELETE on tasks for authenticated users
CREATE POLICY tasks_delete_allowed
  ON public.tasks FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- floors: project members can read/manage floors that belong to their projects
CREATE POLICY floors_select_project_members
  ON public.floors FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.project_members pm ON pm.project_id = b.project_id
      WHERE b.id = public.floors.building_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY floors_insert_project_members
  ON public.floors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.project_members pm ON pm.project_id = b.project_id
      WHERE b.id = public.floors.building_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY floors_update_project_members
  ON public.floors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.project_members pm ON pm.project_id = b.project_id
      WHERE b.id = public.floors.building_id
        AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.project_members pm ON pm.project_id = b.project_id
      WHERE b.id = public.floors.building_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY floors_delete_project_members
  ON public.floors FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.buildings b
      JOIN public.project_members pm ON pm.project_id = b.project_id
      WHERE b.id = public.floors.building_id
        AND pm.user_id = auth.uid()
    )
  );

-- End of RLS policies
