-- Create task_comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(created_at);

-- Enable RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow users to select comments for tasks they can see
CREATE POLICY "Users can view comments on tasks they can access"
  ON task_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      LEFT JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
      AND (
        t.created_by = auth.uid()
        OR t.assigned_user_id = auth.uid()
        OR t.assigned_company_id = p.company_id
      )
    )
  );

-- RLS Policy: Allow authenticated users to insert comments on tasks they can see
CREATE POLICY "Users can add comments to accessible tasks"
  ON task_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks t
      LEFT JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = task_comments.task_id
      AND (
        t.created_by = auth.uid()
        OR t.assigned_user_id = auth.uid()
        OR t.assigned_company_id = p.company_id
      )
    )
  );

-- RLS Policy: Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
  ON task_comments
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: Allow users to delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON task_comments
  FOR DELETE
  USING (user_id = auth.uid());

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_task_comments_updated_at();
