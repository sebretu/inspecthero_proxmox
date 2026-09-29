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

async function testTriggerDetectionGrundfosOG() {
  const targetPlanId = "633c788d-fe28-4f0d-97f1-87d2affe9021"; // Grundfos OG
  console.log(`=== TESTING BACKGROUND DETECTION WORKER ON GRUNDFOS OG (${targetPlanId}) ===`);

  const res = await fetch("http://127.0.0.1:3005/api/symbol-detection/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "X-App-Token": SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      plan_id: targetPlanId
    })
  });

  const text = await res.text();
  console.log(`HTTP Status: ${res.status} ${res.statusText}`);
  console.log("Response:", text);

  console.log("\nWaiting 25 seconds for background worker to process Grundfos OG plan...");
  await new Promise(r => setTimeout(r, 25000));

  const { data: preds, count } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, predicted_symbol_type, confidence, finalScore", { count: "exact" })
    .eq("plan_id", targetPlanId);

  console.log(`\n✅ Checked DB predictions for Grundfos OG (${targetPlanId}): Found ${count || 0} rows!`);
  if (preds && preds.length > 0) {
    console.log("Detected predictions in DB:", preds.slice(0, 15));
  }
}

testTriggerDetectionGrundfosOG();
