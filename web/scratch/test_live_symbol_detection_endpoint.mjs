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

async function testDetectionEndpoint() {
  console.log("=== TESTING LIVE /api/symbol-detection/run ENDPOINT ===");

  // Find an electrical plan in DB (e.g. Grundfos EG / OG or any plan with floor)
  const { data: plans } = await supabase
    .from("plans")
    .select("id, created_at, floors(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  let targetPlanId = plans[0]?.id;
  for (const p of plans || []) {
    const floorName = p.floors?.name || '';
    if (floorName && !floorName.toLowerCase().includes("bma") && !floorName.toLowerCase().includes("zuko")) {
      targetPlanId = p.id;
      break;
    }
  }

  console.log(`Target Plan ID: ${targetPlanId} (${plans?.find(p => p.id === targetPlanId)?.floors?.name})`);

  const t0 = Date.now();
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

  const duration = Date.now() - t0;
  console.log(`HTTP Status: ${res.status} ${res.statusText} (took ${duration}ms)`);

  const text = await res.text();
  console.log("Raw Response Body (first 400 chars):");
  console.log(text.slice(0, 400));

  try {
    const json = JSON.parse(text);
    console.log(`\n✅ LIVE DETECTION API SUCCESSFUL!`);
    console.log(`Accepted Candidates: ${json.data?.accepted_candidates}`);
    console.log(`Detected Symbols: ${json.data?.detected}`);
    console.log(`Saved Predictions Count: ${json.data?.predictions_count}`);
  } catch (err) {
    console.error("JSON PARSE ERROR:", err);
  }
}

testDetectionEndpoint();
