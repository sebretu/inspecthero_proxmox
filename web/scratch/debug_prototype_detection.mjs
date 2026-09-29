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

async function testRpc() {
  console.log("=== TESTING PROTOTYPE EMBEDDINGS & SIMILARITY RPC ===");

  const { data: prototypes } = await supabase
    .from("prototype_symbols")
    .select("id, category, filename, embedding_status, active, storage_path, embedding");

  console.log("Prototypes count:", prototypes?.length || 0);

  if (prototypes && prototypes.length > 0) {
    const p0 = prototypes[0];
    let vec = p0.embedding;
    if (typeof vec === "string") {
      try { vec = JSON.parse(vec); } catch {}
    }

    console.log("Vector parsed length:", Array.isArray(vec) ? vec.length : typeof vec);

    // Call RPC get_similar_symbols
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_similar_symbols", {
      query_embedding: vec,
      match_limit: 5
    });

    console.log("get_similar_symbols result:", rpcErr ? rpcErr.message : rpcData);

    // Also check symbol_crops table for approved sockets to see similarity between prototype and real plan crops!
    const { data: approvedCrops } = await supabase
      .from("symbol_crops")
      .select("id, symbol_type, embedding")
      .eq("quality_status", "approved")
      .eq("symbol_type", "socket")
      .limit(10);

    console.log("\nChecking similarity between Prototype #0 and 10 approved socket crops in DB:");
    for (const crop of approvedCrops || []) {
      let cVec = crop.embedding;
      if (typeof cVec === "string") {
        try { cVec = JSON.parse(cVec); } catch {}
      }
      
      if (Array.isArray(vec) && Array.isArray(cVec)) {
        let dot = 0, n1 = 0, n2 = 0;
        for (let i = 0; i < vec.length; i++) {
          dot += vec[i] * cVec[i];
          n1 += vec[i] * vec[i];
          n2 += cVec[i] * cVec[i];
        }
        const sim = (n1 > 0 && n2 > 0) ? (dot / (Math.sqrt(n1) * Math.sqrt(n2))) : 0;
        console.log(`- Crop ${crop.id} (${crop.symbol_type}): Similarity = ${sim.toFixed(4)}`);
      }
    }
  }
}

testRpc();
