DROP POLICY IF EXISTS storage_objects_select_task_photos ON storage.objects;
CREATE POLICY storage_objects_select_task_photos
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-photos');

DROP POLICY IF EXISTS task_photos_insert_allowed ON public.task_photos;
CREATE POLICY task_photos_insert_allowed
  ON public.task_photos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS validate_task_status_transition ON public.tasks;
DROP FUNCTION IF EXISTS check_task_status_transition() CASCADE;

DROP POLICY IF EXISTS tasks_update_allowed ON public.tasks;
CREATE POLICY tasks_update_allowed
  ON public.tasks FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tasks_delete_allowed ON public.tasks;
CREATE POLICY tasks_delete_allowed
  ON public.tasks FOR DELETE
  USING (auth.uid() IS NOT NULL);