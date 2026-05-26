-- Ensure task_comments matches the application schema expected by /api/task-comments
BEGIN;

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF to_regclass('public.task_comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND column_name = 'content'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND column_name = 'comment'
    ) THEN
      ALTER TABLE public.task_comments RENAME COLUMN content TO comment;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.task_comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND column_name = 'author_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.task_comments RENAME COLUMN author_id TO user_id;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.task_comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND constraint_name = 'task_comments_author_id_fkey'
    ) THEN
      ALTER TABLE public.task_comments DROP CONSTRAINT task_comments_author_id_fkey;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.task_comments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'task_comments' AND constraint_name = 'task_comments_user_id_fkey'
    ) THEN
      ALTER TABLE public.task_comments
        ADD CONSTRAINT task_comments_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view comments on tasks they can access" ON public.task_comments;
DROP POLICY IF EXISTS "Users can add comments to accessible tasks" ON public.task_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.task_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.task_comments;

CREATE POLICY "Users can view comments on tasks they can access"
  ON public.task_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assigned_user_id = auth.uid()
          OR t.assigned_company_id = p.company_id
        )
    )
  );

CREATE POLICY "Users can add comments to accessible tasks"
  ON public.task_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      LEFT JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assigned_user_id = auth.uid()
          OR t.assigned_company_id = p.company_id
        )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON public.task_comments
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON public.task_comments
  FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON public.task_comments(created_at);

CREATE OR REPLACE FUNCTION public.update_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_comments_updated_at ON public.task_comments;

CREATE TRIGGER trigger_update_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_comments_updated_at();

COMMIT;
