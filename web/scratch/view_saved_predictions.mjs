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

async function viewHalle4Predictions() {
  const planId = "0484685f-5bf5-462f-b1d5-18ddcd6152a6"; // SEGRO Flingern / Halle 4 - EG
  console.log(`=== VIEWING SAVED PREDICTIONS FOR SEGRO FLINGERN / HALLE 4 - EG (${planId}) ===`);

  const { data: preds, count, error } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, predicted_symbol_type, confidence, status, x_norm, y_norm, metadata", { count: "exact" })
    .eq("plan_id", planId);

  if (error) {
    console.error("SELECT ERROR:", error);
    return;
  }

  console.log(`\n🎉 SUCCESS! Total Predictions Saved in DB for SEGRO Halle 4 - EG: ${count || preds?.length || 0}`);
  for (const p of preds || []) {
    const fsVal = p.metadata?.finalScore ?? 'N/A';
    console.log(`- ID: ${p.id.slice(0, 8)}... | Type: '${p.predicted_symbol_type}' | Conf: ${p.confidence} | Score: ${fsVal} | Pos: (${p.x_norm.toFixed(4)}, ${p.y_norm.toFixed(4)}) | Status: '${p.status}'`);
  }
}

viewHalle4Predictions();
