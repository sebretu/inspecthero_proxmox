-- Add is_archived column to trommels table
ALTER TABLE trommels ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
