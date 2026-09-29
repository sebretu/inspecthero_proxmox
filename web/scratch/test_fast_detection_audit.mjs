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

async function testFastAudit() {
  console.log("=== FAST DETECTION AUDIT FOR PLANS IN DATABASE ===");

  // 1. Fetch active prototypes
  const { data: prototypes } = await supabase
    .from("prototype_symbols")
    .select("id, category, filename, active, embedding_status, embedding")
    .eq("active", true);

  console.log(`Active prototypes in DB: ${prototypes?.length || 0}`);
  for (const p of prototypes || []) {
    let vec = p.embedding;
    if (typeof vec === "string") {
      try { vec = JSON.parse(vec); } catch {}
    }
    const len = Array.isArray(vec) ? vec.length : typeof vec;
    console.log(`- Prototype ID: ${p.id} | Category: '${p.category}' | Status: ${p.embedding_status} | VecLen: ${len}`);
  }

  // 2. Fetch recent plans from plans table
  const { data: plans } = await supabase
    .from("plans")
    .select("id, pdf_path, storage_path, created_at, floors(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log(`\nChecking 10 recent plans:`);
  for (const plan of plans || []) {
    const { count: cropCount } = await supabase
      .from("symbol_crops")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id);

    const { count: pinCount } = await supabase
      .from("stromkreise")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id);

    console.log(`- Plan ${plan.id} (${plan.floors?.name || 'N/A'}): ${cropCount || 0} crops, ${pinCount || 0} pins`);
  }

  // 3. Test matching on 50 approved crops in DB with the exact symbolMatcher logic
  const { matchSymbol } = await import("../src/lib/symbolMatcher.ts");
  const { data: sampleCrops } = await supabase
    .from("symbol_crops")
    .select("id, plan_id, symbol_type, quality_status, embedding")
    .eq("quality_status", "approved")
    .limit(50);

  console.log(`\nTesting matchSymbol() on ${sampleCrops?.length || 0} approved crops in DB:`);
  let detectedCount = 0;
  let rejectedThreshold = 0;
  let rejectedGap = 0;

  for (const crop of sampleCrops || []) {
    let cVec = crop.embedding;
    if (typeof cVec === "string") {
      try { cVec = JSON.parse(cVec); } catch {}
    }
    if (!Array.isArray(cVec)) continue;

    const matchRes = await matchSymbol(cVec);
    if (!matchRes.best) {
      console.log(`- Crop ${crop.id.slice(0, 8)}... (${crop.symbol_type}): NO BEST MATCH`);
      continue;
    }

    const bestSim = matchRes.best.similarity;
    const gap = matchRes.best.gap;

    const reqThreshold = 0.32; // Prototype mode threshold
    const minGapReq = 0.005;   // Prototype mode gap

    const passSim = bestSim >= reqThreshold;
    const passGap = gap >= minGapReq;

    if (passSim && passGap) {
      detectedCount++;
      console.log(`- Crop ${crop.id.slice(0, 8)}... (${crop.symbol_type}) => ✅ MATCHED as '${matchRes.best.symbol_type}' (Sim: ${bestSim}, Gap: ${gap})`);
    } else {
      if (!passSim) rejectedThreshold++;
      if (!passGap) rejectedGap++;
      console.log(`- Crop ${crop.id.slice(0, 8)}... (${crop.symbol_type}) => ❌ REJECTED (Sim: ${bestSim} vs req ${reqThreshold}, Gap: ${gap} vs req ${minGapReq})`);
    }
  }

  console.log(`\n=== FAST AUDIT RESULTS ===`);
  console.log(`Total Approved Sample Crops: ${sampleCrops?.length || 0}`);
  console.log(`Detected: ${detectedCount}`);
  console.log(`Rejected due to Threshold (< 0.32): ${rejectedThreshold}`);
  console.log(`Rejected due to Gap (< 0.005): ${rejectedGap}`);
}

testFastAudit();
