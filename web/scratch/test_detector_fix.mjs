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

async function testMatchFix() {
  console.log("=== TESTING MATCHSYMBOL GAP FIX ===");

  const { data: prototypes } = await supabase
    .from("prototype_symbols")
    .select("id, category, filename, embedding");

  if (!prototypes || prototypes.length === 0) return;

  const p0 = prototypes[0];
  let vec = p0.embedding;
  if (typeof vec === "string") {
    try { vec = JSON.parse(vec); } catch {}
  }

  // Fetch top 10 matches via RPC
  const { data: matches } = await supabase.rpc("get_similar_symbols", {
    query_embedding: vec,
    match_limit: 10
  });

  console.log("Raw RPC matches:", matches);

  if (matches && matches.length > 0) {
    const topMatch = matches[0];
    // OLD BAD GAP LOGIC:
    const oldSecondMatch = matches[1];
    const oldBestSim = Number(Number(topMatch.similarity).toFixed(4));
    const oldSecondSim = oldSecondMatch ? Number(Number(oldSecondMatch.similarity).toFixed(4)) : 0;
    const oldGap = Number((oldBestSim - oldSecondSim).toFixed(4));

    // NEW FIXED GAP LOGIC:
    const newSecondMatch = matches.find(m => m.symbol_type !== topMatch.symbol_type);
    const newSecondSim = newSecondMatch ? Number(Number(newSecondMatch.similarity).toFixed(4)) : 0;
    const newGap = Number((oldBestSim - newSecondSim).toFixed(4));

    console.log("\nComparison:");
    console.log(`OLD LOGIC: Top=${topMatch.symbol_type} (${oldBestSim}), 2nd=${oldSecondMatch?.symbol_type} (${oldSecondSim}), GAP=${oldGap} => ${oldGap >= 0.012 ? "PASS" : "REJECT (BUG!)"}`);
    console.log(`NEW LOGIC: Top=${topMatch.symbol_type} (${oldBestSim}), 2nd Competing=${newSecondMatch?.symbol_type || "none"} (${newSecondSim}), GAP=${newGap} => ${newGap >= 0.012 ? "PASS" : "REJECT"}`);
  }
}

testMatchFix();
