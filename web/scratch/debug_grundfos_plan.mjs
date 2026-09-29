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

async function findGrundfosPlan() {
  console.log("=== SEARCHING FOR GRUNDFOS PLAN IN DB ===");

  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  console.log("Recent 10 plans:");
  for (const p of plans || []) {
    console.log(`- ID: ${p.id} | Created: ${p.created_at} | PDF_Path: ${p.pdf_path} | Storage_Path: ${p.storage_path} | Bucket: ${p.storage_bucket}`);
  }

  // Check if any plan contains Grundfos in name or related tables
  const { data: floors } = await supabase
    .from("floors")
    .select("id, name, buildings(name, projects(name))");

  console.log("\nRecent floors/projects:");
  for (const f of floors || []) {
    console.log(`- Floor: ${f.name} | Building: ${f.buildings?.name} | Project: ${f.buildings?.projects?.name}`);
  }
}

findGrundfosPlan();
