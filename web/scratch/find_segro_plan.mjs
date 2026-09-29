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

async function findPlanCorrected() {
  console.log("=== FINDING PLAN 'SEGRO Flingern/Halle 4 - EG' IN DB ===");
  const { data: plans, error } = await supabase
    .from("plans")
    .select("*")
    .limit(50);

  if (error) {
    console.error("Query error:", error);
    return;
  }

  console.log(`Found ${plans?.length || 0} plans in table:`);
  for (const p of plans || []) {
    const nameStr = p.title || p.filename || p.original_name || p.storage_path || JSON.stringify(p);
    if (nameStr.toLowerCase().includes("segro") || nameStr.toLowerCase().includes("halle 4") || nameStr.toLowerCase().includes("flingern")) {
      console.log(`🎯 MATCHED PLAN: ID: ${p.id} | Name/Path: '${nameStr}'`);
    } else {
      console.log(`- ID: ${p.id} | Info: ${p.title || p.filename || p.storage_path}`);
    }
  }
}

findPlanCorrected();
