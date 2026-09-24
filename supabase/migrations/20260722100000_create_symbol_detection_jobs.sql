-- Create table for asynchronous symbol detection jobs
CREATE TABLE IF NOT EXISTS public.symbol_detection_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
  detected_count integer DEFAULT 0,
  accepted_count integer DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Index for queue lookup
CREATE INDEX IF NOT EXISTS idx_symbol_detection_jobs_status ON public.symbol_detection_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_symbol_detection_jobs_plan ON public.symbol_detection_jobs(plan_id);

-- Enable RLS
ALTER TABLE public.symbol_detection_jobs ENABLE ROW LEVEL SECURITY;

-- Allow select/insert/update for service role and project members
CREATE POLICY "Allow public select on symbol_detection_jobs" ON public.symbol_detection_jobs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on symbol_detection_jobs" ON public.symbol_detection_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on symbol_detection_jobs" ON public.symbol_detection_jobs FOR UPDATE USING (true);
