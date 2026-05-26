-- Fix task_comments table
-- Execute this in Supabase SQL Editor

DROP TABLE IF EXISTS task_comments CASCADE;

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON task_comments(user_id);
CREATE INDEX idx_task_comments_created_at ON task_comments(created_at);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on accessible tasks"
  ON task_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      LEFT JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
      AND (t.created_by = auth.uid() OR t.assigned_user_id = auth.uid() OR t.assigned_company_id = p.company_id)
    )
  );

CREATE POLICY "Users can add comments to accessible tasks"
  ON task_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      LEFT JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
      AND (t.created_by = auth.uid() OR t.assigned_user_id = auth.uid() OR t.assigned_company_id = p.company_id)
    )
  );

CREATE POLICY "Users can update own comments"
  ON task_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON task_comments FOR DELETE
  USING (user_id = auth.uid());
