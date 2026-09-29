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

async function inspectRpcDefinition() {
  console.log("=== INSPECTING RPC get_similar_symbols DEFINITION ===");

  // Query PostgreSQL pg_proc to get the exact SQL definition of get_similar_symbols
  const { data: plans } = await supabase
    .from("plans")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Recent plans in DB:");
  for (const p of plans || []) {
    console.log(`- Plan ID: ${p.id} | Created: ${p.created_at}`);
  }

  // Fetch active prototype symbols
  const { data: prototypes } = await supabase
    .from("prototype_symbols")
    .select("id, category, filename, active, embedding_status, embedding");

  console.log("\nActive Prototypes in DB:");
  for (const p of prototypes || []) {
    const hasEmb = p.embedding ? true : false;
    console.log(`- ID: ${p.id} | Category: '${p.category}' | Filename: ${p.filename} | Active: ${p.active} | HasEmbedding: ${hasEmb}`);
  }

  // Test get_similar_symbols with prototype vector
  if (prototypes && prototypes.length > 0 && prototypes[0].embedding) {
    let vec = prototypes[0].embedding;
    if (typeof vec === "string") {
      try { vec = JSON.parse(vec); } catch {}
    }

    console.log("\nCalling RPC get_similar_symbols...");
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("get_similar_symbols", {
      query_embedding: vec,
      match_limit: 10
    });

    if (rpcErr) {
      console.error("RPC Error:", rpcErr);
    } else {
      console.log(`RPC returned ${rpcRes?.length || 0} matches:`, JSON.stringify(rpcRes, null, 2));
    }
  }
}

inspectRpcDefinition();
