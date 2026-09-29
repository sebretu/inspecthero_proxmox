const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Parse env
const envPath = "/home/ubuntu/inspecthero-web.env";
let env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        env[key] = val;
      }
    }
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in env!");
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkAndSetup() {
  console.log("Checking plan_cable_connections table via Supabase client...");
  
  // Try querying table
  const { data, error } = await supabase
    .from("plan_cable_connections")
    .select("id")
    .limit(1);

  if (error) {
    console.log("Query returned error or table not found:", error.message);
    console.log("Error code:", error.code);
  } else {
    console.log("Table plan_cable_connections already exists and is queryable! Data sample:", data);
  }
}

checkAndSetup().catch(console.error);
