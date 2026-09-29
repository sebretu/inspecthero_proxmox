const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const envPath = "/home/ubuntu/inspecthero-web.env";
let env = {};
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx > -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testTables() {
  const tables = [
    "cables",
    "cable_routes",
    "cable_buses",
    "bma_connections",
    "plan_bma_symbols",
    "plan_measurements",
    "plans"
  ];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.log(`Table ${t}: Error -> ${error.message} (${error.code})`);
    } else {
      console.log(`Table ${t}: OK, fields:`, data[0] ? Object.keys(data[0]) : "Empty table");
    }
  }
}

testTables().catch(console.error);
