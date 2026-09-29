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

async function findSegroDetails() {
  console.log("=== SEARCHING FLOORS & PROJECTS FOR SEGRO FLINGERN / HALLE 4 - EG ===");

  const { data: projects } = await supabase.from("projects").select("id, name");
  console.log("\nPROJECTS:");
  for (const p of projects || []) {
    console.log(`- Project ID: ${p.id} | Name: '${p.name}'`);
  }

  const { data: floors } = await supabase.from("floors").select("id, project_id, name");
  console.log("\nFLOORS:");
  for (const f of floors || []) {
    if (f.name.toLowerCase().includes("segro") || f.name.toLowerCase().includes("halle 4") || f.name.toLowerCase().includes("flingern") || f.name.toLowerCase().includes("eg")) {
      console.log(`🎯 MATCHED FLOOR: ID: ${f.id} | Project: ${f.project_id} | Name: '${f.name}'`);
    } else {
      console.log(`- Floor ID: ${f.id} | Project: ${f.project_id} | Name: '${f.name}'`);
    }
  }

  // Find corresponding plan row in plans table
  const { data: plans } = await supabase.from("plans").select("id, floor_id, storage_path");
  console.log("\nPLANS MAPPING:");
  for (const pl of plans || []) {
    const matchedFloor = floors?.find(f => f.id === pl.floor_id);
    if (matchedFloor) {
      console.log(`- Plan ID: ${pl.id} | Floor: '${matchedFloor.name}' | Path: ${pl.storage_path}`);
    }
  }
}

findSegroDetails();
