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

async function matchFloorNames() {
  console.log("=== MATCHING FLOOR NAMES FOR SEGRO FLINGERN ===");

  const { data: plans } = await supabase.from("plans").select("id, floor_id, storage_path");
  const { data: floors } = await supabase.from("floors").select("id, name, level");

  for (const pl of plans || []) {
    const floor = floors?.find(f => f.id === pl.floor_id);
    const floorName = floor ? floor.name : "Unknown Floor";
    if (floorName.toLowerCase().includes("halle 4") || floorName.toLowerCase().includes("eg") || pl.storage_path.includes("9134fda1")) {
      console.log(`🎯 TARGET PLAN: ID: ${pl.id} | Floor Name: '${floorName}' | Path: ${pl.storage_path}`);
    }
  }
}

matchFloorNames();
