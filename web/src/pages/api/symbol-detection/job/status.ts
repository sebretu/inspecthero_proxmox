import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { plan_id, job_id } = req.query;
  if (!plan_id && !job_id) {
    return res.status(400).json({ error: "Missing plan_id or job_id parameter" });
  }

  const supabase = getSupabaseAdminClient();

  try {
    let query = supabase.from("symbol_detection_jobs").select("*");

    if (job_id) {
      query = query.eq("id", String(job_id));
    } else if (plan_id) {
      query = query.eq("plan_id", String(plan_id)).order("created_at", { ascending: false }).limit(1);
    }

    const { data: jobs, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const job = jobs && jobs.length > 0 ? jobs[0] : null;

    return res.status(200).json({
      ok: true,
      data: job ? {
        id: job.id,
        plan_id: job.plan_id,
        status: job.status,
        detected_count: job.detected_count,
        accepted_count: job.accepted_count,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      } : null
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
