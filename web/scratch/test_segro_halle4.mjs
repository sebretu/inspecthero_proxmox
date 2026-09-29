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

async function testSegroHalle4() {
  const planId = "0484685f-5bf5-462f-b1d5-18ddcd6152a6"; // Unit 4 Linear / Halle 4 EG
  console.log(`=== RUNNING TEST ON SEGRO FLINGERN / HALLE 4 - EG (Plan: ${planId}) ===`);

  // 1. Trigger symbol detection API
  const token = envVars.TEST_ADMIN_TOKEN || "";
  const detectRes = await fetch("http://localhost:3005/api/symbol-detection/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_id: planId })
  });

  const detectJson = await detectRes.json();
  console.log("\n[Symbol Detection Trigger Response]:", detectJson);

  // 2. Trigger BMA Scan API on existing plan
  const bmaRes = await fetch("http://localhost:3005/api/bma/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, useExisting: true })
  });

  const bmaJson = await bmaRes.json();
  console.log("\n[BMA Text Scan Response]:", {
    ok: bmaJson.ok,
    deviceCount: bmaJson.data?.devices?.length || 0,
    sampleDevices: bmaJson.data?.devices?.slice(0, 10)
  });
}

testSegroHalle4();
