import fs from "fs";

const ENV_PATH = "/home/ubuntu/inspecthero-web.env";
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, v] = trimmed.split("=", 2);
      process.env[k.trim()] = v.trim();
    }
  });
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkJobs() {
  console.log("=== CHECKING SYMBOL DETECTION JOBS IN DB ===");

  const { data: jobs, error } = await supabase
    .from("symbol_detection_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching symbol_detection_jobs:", error);
    return;
  }

  console.log(`Found ${jobs?.length || 0} recent jobs in DB:`);
  for (const j of jobs || []) {
    console.log(`- Job ID: ${j.id} | Plan: ${j.plan_id} | Status: ${j.status} | Detected: ${j.detected_count} | Error: ${j.error_message || 'none'} | Created: ${j.created_at}`);
  }

  const { data: predictions, count: predCount } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, predicted_symbol_type, confidence, finalScore", { count: "exact" })
    .limit(20);

  console.log(`\nTotal symbol_predictions in DB: ${predCount || 0}`);
  for (const p of predictions || []) {
    console.log(`- Pred ID: ${p.id} | Plan: ${p.plan_id} | Type: '${p.predicted_symbol_type}' | Conf: ${p.confidence} | Score: ${p.finalScore}`);
  }
}

checkJobs();
