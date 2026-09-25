-- Drop all old policies to start fresh
DROP POLICY IF EXISTS profiles_select_self_or_company ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS tasks_select_allowed ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_owner ON public.tasks;
DROP POLICY IF EXISTS tasks_update_allowed ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_allowed ON public.tasks;
DROP POLICY IF EXISTS task_photos_select_allowed ON public.task_photos;
DROP POLICY IF EXISTS task_photos_insert_allowed ON public.task_photos;
DROP POLICY IF EXISTS storage_objects_select_task_photos ON storage.objects;
DROP POLICY IF EXISTS storage_objects_insert_task_photos ON storage.objects;
DROP POLICY IF EXISTS floors_select_project_members ON public.floors;
DROP POLICY IF EXISTS floors_insert_project_members ON public.floors;
DROP POLICY IF EXISTS floors_update_project_members ON public.floors;
DROP POLICY IF EXISTS floors_delete_project_members ON public.floors;

-- Drop any stale triggers
DROP TRIGGER IF EXISTS validate_task_status_transition ON public.tasks;
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;

-- Create relaxed policies for dev
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY profiles_update_all ON public.profiles FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY tasks_select_all ON public.tasks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY tasks_insert_all ON public.tasks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY tasks_update_all ON public.tasks FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY tasks_delete_all ON public.tasks FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY task_photos_select_all ON public.task_photos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY task_photos_insert_all ON public.task_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY storage_objects_select_all ON storage.objects FOR SELECT USING (bucket_id = 'task-photos');

CREATE POLICY floors_select_all ON public.floors FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY floors_insert_all ON public.floors FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY floors_update_all ON public.floors FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY floors_delete_all ON public.floors FOR DELETE USING (auth.uid() IS NOT NULL);