-- Add task_id column to orders table to support material requisitions from tasks
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Add index for task_id for better performance
CREATE INDEX IF NOT EXISTS idx_orders_task_id ON public.orders(task_id);

-- Ensure CART status prefix/support if needed (assuming status is text or we add it to enum)
-- If status is an enum, we might need a separate migration to update it, but usually it is text here.
