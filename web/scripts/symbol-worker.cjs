#!/usr/bin/env node

/**
 * Isolated Background Worker for Symbol Detection
 * Runs heavy AI detection in a standalone Node.js process.
 */

const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

// Load environment variables
const envPath = "/home/ubuntu/inspecthero-web.env";
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[symbol-worker] Missing SUPABASE URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Dynamically import detectSymbols (built JS or TS compilation via ts-node/register if needed, or import from standalone/dist)
async function getDetectSymbolsFunction() {
  try {
    // Try requiring from Next.js build or ts-node/module
    const detectorModule = require("../src/lib/symbolDetector");
    return detectorModule.detectSymbols;
  } catch (err) {
    try {
      // Try dist or ts-node if required
      require("ts-node/register");
      const detectorModule = require("../src/lib/symbolDetector.ts");
      return detectorModule.detectSymbols;
    } catch (err2) {
      console.error("[symbol-worker] Could not import detectSymbols:", err.message, err2.message);
      throw err;
    }
  }
}

async function processJob(jobId, planId) {
  console.log(`[symbol-worker] Processing job ${jobId} for plan ${planId}...`);

  // Update status to processing
  await supabase
    .from("symbol_detection_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString()
    })
    .eq("id", jobId);

  try {
    const detectSymbols = await getDetectSymbolsFunction();
    const result = await detectSymbols(planId);

    console.log(`[symbol-worker] Job ${jobId} completed successfully:`, result);

    if (result.predictions && result.predictions.length > 0) {
      const rowsToInsert = result.predictions.map((p) => ({
        plan_id: planId,
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

      // Delete existing pending predictions for this plan
      await supabase
        .from("symbol_predictions")
        .delete()
        .eq("plan_id", planId)
        .eq("status", "pending");

      const { error: insertErr } = await supabase
        .from("symbol_predictions")
        .insert(rowsToInsert);

      if (insertErr) {
        console.error("[symbol-worker] Error inserting predictions into DB:", insertErr);
      } else {
        console.log(`[symbol-worker] Saved ${rowsToInsert.length} predictions into DB.`);
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
      .eq("id", jobId);

  } catch (err) {
    console.error(`[symbol-worker] Job ${jobId} failed:`, err.message);

    await supabase
      .from("symbol_detection_jobs")
      .update({
        status: "failed",
        error_message: err.message || String(err),
        completed_at: new Date().toISOString()
      })
      .eq("id", jobId);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check CLI arguments (--job <job_id> --plan <plan_id>)
  let jobId = null;
  let planId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--job" && args[i + 1]) jobId = args[i + 1];
    if (args[i] === "--plan" && args[i + 1]) planId = args[i + 1];
  }

  if (jobId && planId) {
    await processJob(jobId, planId);
    process.exit(0);
  }

  if (planId && !jobId) {
    // Insert new job record
    const { data: job, error } = await supabase
      .from("symbol_detection_jobs")
      .insert({ plan_id: planId, status: "queued" })
      .select("id")
      .single();

    if (error || !job) {
      console.error("[symbol-worker] Failed to create job record:", error?.message);
      process.exit(1);
    }
    await processJob(job.id, planId);
    process.exit(0);
  }

  // Polling mode: look for queued jobs
  console.log("[symbol-worker] Starting background worker in queue polling mode...");

  while (true) {
    try {
      const { data: jobs, error } = await supabase
        .from("symbol_detection_jobs")
        .select("id, plan_id")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        console.error("[symbol-worker] Queue query error:", error.message);
      } else if (jobs && jobs.length > 0) {
        const nextJob = jobs[0];
        await processJob(nextJob.id, nextJob.plan_id);
      }
    } catch (err) {
      console.error("[symbol-worker] Loop error:", err.message);
    }

    // Sleep 3 seconds before next queue poll
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  console.error("[symbol-worker] Fatal error:", err);
  process.exit(1);
});
