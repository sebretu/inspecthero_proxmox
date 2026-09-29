import fs from "fs";

const ENV_PATH = "/home/ubuntu/inspecthero-web.env";
const envVars = {};
if (fs.existsSync(ENV_PATH)) {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [k, v] = trimmed.split("=", 2);
      envVars[k.trim()] = v.trim();
    }
  });
}

const SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkJobDetail() {
  console.log("=== CHECKING RECENT DETECTION JOBS IN DB ===");

  const { data: jobs } = await supabase
    .from("symbol_detection_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Recent Jobs:");
  for (const j of jobs || []) {
    console.log(`- Job ID: ${j.id} | Plan: ${j.plan_id} | Status: '${j.status}' | Detected: ${j.detected_count} | Accepted: ${j.accepted_count} | Error: '${j.error_message || 'none'}' | Created: ${j.created_at}`);
  }
}

checkJobDetail();
