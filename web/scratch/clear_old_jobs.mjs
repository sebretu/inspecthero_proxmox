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

async function clearOldJobs() {
  console.log("=== CLEARING OLD STUCK QUEUED JOBS IN DB ===");
  const { data, error } = await supabase
    .from("symbol_detection_jobs")
    .delete()
    .in("status", ["queued", "processing"]);

  if (error) {
    console.error("Error clearing old jobs:", error);
  } else {
    console.log("Cleared old stuck jobs from symbol_detection_jobs table.");
  }
}

clearOldJobs();
