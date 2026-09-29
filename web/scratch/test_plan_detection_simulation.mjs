import { createClient } from "@supabase/supabase-js";
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

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function simulateFixedPlanDetection() {
  console.log("=== TESTING FIXED MATCHING LOGIC & THRESHOLD ON 20 PLAN CROPS ===");

  const { data: planCrops } = await supabase
    .from("symbol_crops")
    .select("id, symbol_type, quality_status, embedding")
    .eq("quality_status", "approved")
    .eq("symbol_type", "socket")
    .limit(20);

  let detectedCount = 0;

  // PROTOTYPE THRESHOLD = 0.32
  const PROTOTYPE_THRESHOLD = 0.32;
  const minGapReq = 0.012;

  for (const crop of planCrops || []) {
    let cVec = crop.embedding;
    if (typeof cVec === "string") {
      try { cVec = JSON.parse(cVec); } catch {}
    }
    if (!Array.isArray(cVec)) continue;

    const { data: rpcMatches } = await supabase.rpc("get_similar_symbols", {
      query_embedding: cVec,
      match_limit: 10
    });

    if (!rpcMatches || rpcMatches.length === 0) continue;

    const topMatch = rpcMatches[0];

    // FIX 1: Find second match of a DIFFERENT category (competing class)
    const secondMatch = rpcMatches.find(m => m.symbol_type !== topMatch.symbol_type);

    const bestSim = Number(Number(topMatch.similarity).toFixed(4));
    const secondSim = secondMatch ? Number(Number(secondMatch.similarity).toFixed(4)) : 0;
    const gap = Number((bestSim - secondSim).toFixed(4));

    const passThreshold = (bestSim >= PROTOTYPE_THRESHOLD);
    const passGap = (gap >= minGapReq);

    console.log(`- Crop ${crop.id.slice(0, 8)}... | Top Match: ${topMatch.symbol_type} (${bestSim}) | 2nd Competing: ${secondMatch?.symbol_type || "none"} (${secondSim}) | Gap: ${gap} => ${passThreshold && passGap ? "✅ DETECTED" : "❌ REJECTED"}`);

    if (passThreshold && passGap) detectedCount++;
  }

  console.log(`\n=== FIXED SIMULATION RESULT ===`);
  console.log(`Total Candidates: ${planCrops?.length || 0}`);
  console.log(`Detected Sockets: ${detectedCount} / 20 (Detection rate: ${detectedCount / 20 * 100}%)`);
}

simulateFixedPlanDetection();
