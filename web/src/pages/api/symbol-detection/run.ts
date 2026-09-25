import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { detectSymbols } from "@/lib/symbolDetector";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 120,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { plan_id } = req.body;
  if (!plan_id) {
    return res.status(400).json({ error: "Missing plan_id parameter" });
  }

  const supabase = getSupabaseAdminClient();

  try {
    // Check if there is already an active job running for this plan
    const { data: existingJob } = await supabase
      .from("symbol_detection_jobs")
      .select("id, status")
      .eq("plan_id", plan_id)
      .in("status", ["queued", "processing"])
      .maybeSingle();

    if (existingJob) {
      return res.status(200).json({
        ok: true,
        data: {
          started: false,
          already_running: true,
          job_id: existingJob.id,
          status: existingJob.status
        }
      });
    }

    // Insert new job record into queue
    const { data: newJob, error: insertJobErr } = await supabase
      .from("symbol_detection_jobs")
      .insert({
        plan_id,
        status: "processing",
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (insertJobErr || !newJob) {
      console.error("[api/symbol-detection/run] Failed to enqueue job:", insertJobErr?.message);
      return res.status(500).json({ error: "Failed to queue detection job" });
    }

    console.log(`[api/symbol-detection/run] Started background detection (Job ${newJob.id}) for plan ${plan_id}`);

    // Execute detection in background IIFE without blocking the HTTP response
    (async () => {
      try {
        const result = await detectSymbols(plan_id);
        console.log(`[api/symbol-detection/run] Detection finished for plan ${plan_id}. Accepted: ${result.accepted_candidates}, Detected: ${result.detected}`);

        if (result.predictions && result.predictions.length > 0) {
          const rowsToInsert = result.predictions.map((p) => ({
            plan_id,
            x_norm: p.x_norm,
            y_norm: p.y_norm,
            predicted_symbol_type: p.predicted_symbol_type,
            confidence: p.confidence,
            matched_crop_id: null,
            status: "pending",
            metadata: {
              finalScore: p.finalScore,
              matched_prototype_id: p.matched_crop_id,
              size: p.size,
              objectness_score: p.objectness_score,
              similarity: p.similarity,
              second_similarity: p.second_similarity,
              gap: p.gap
            }
          }));

          // Clear existing pending predictions for this plan
          await supabase
            .from("symbol_predictions")
            .delete()
            .eq("plan_id", plan_id)
            .eq("status", "pending");

          const { error: insertErr } = await supabase
            .from("symbol_predictions")
            .insert(rowsToInsert);

          if (insertErr) {
            console.error("[api/symbol-detection/run] Error inserting predictions into DB:", insertErr);
          } else {
            console.log(`[api/symbol-detection/run] Saved ${rowsToInsert.length} predictions into DB.`);
          }
        }

        await supabase
          .from("symbol_detection_jobs")
          .update({
            status: "completed",
            detected_count: result.detected || 0,
            accepted_count: result.accepted_candidates || 0,
            completed_at: new Date().toISOString()
          })
          .eq("id", newJob.id);

      } catch (err: any) {
        console.error(`[api/symbol-detection/run] Job ${newJob.id} failed:`, err);
        await supabase
          .from("symbol_detection_jobs")
          .update({
            status: "failed",
            error_message: err.message || String(err),
            completed_at: new Date().toISOString()
          })
          .eq("id", newJob.id);
      }
    })();

    // Return immediate response to client
    return res.status(200).json({
      ok: true,
      data: {
        started: true,
        job_id: newJob.id,
        status: "processing"
      }
    });
  } catch (err: any) {
    console.error("[api/symbol-detection/run] Error starting detection:", err.message);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
