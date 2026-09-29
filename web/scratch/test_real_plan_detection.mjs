import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testRealPlanDetection() {
  console.log("=== DIAGNOSING REAL PLAN DETECTION PIPELINE ===");

  // Fetch recent plans
  const { data: plans } = await supabase
    .from("plans")
    .select("id, pdf_path, storage_path, storage_bucket, image_width, image_height, created_at, floors(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("Recent 10 plans:");
  for (const p of plans || []) {
    console.log(`- Plan ID: ${p.id} | Floor: ${p.floors?.name || 'N/A'} | Path: ${p.storage_path || p.pdf_path}`);
  }

  // Import detectSymbols from web/src/lib/symbolDetector
  try {
    const { detectSymbols } = await import("../src/lib/symbolDetector.ts");
    const testPlanId = plans[0].id;
    console.log(`\nRunning detectSymbols for Plan ID: ${testPlanId} (${plans[0].floors?.name})...`);

    const result = await detectSymbols(testPlanId);
    console.log("\nDetection Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Error executing detectSymbols:", err);
  }
}

testRealPlanDetection();
