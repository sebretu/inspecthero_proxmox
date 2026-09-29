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

async function viewAllPredictions() {
  console.log("=== VIEWING ALL SYMBOL PREDICTIONS IN DB ===");
  const { data: preds } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, predicted_symbol_type, confidence, status, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  console.log(`Found ${preds?.length || 0} predictions:`);
  for (const p of preds || []) {
    console.log(`- ID: ${p.id} | Plan: ${p.plan_id} | Type: '${p.predicted_symbol_type}' | Conf: ${p.confidence} | Status: '${p.status}' | Created: ${p.created_at}`);
  }
}

viewAllPredictions();
