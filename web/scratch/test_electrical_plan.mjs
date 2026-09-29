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

async function findElectricalPlan() {
  console.log("=== LISTING ALL PLANS AND THEIR FLOORS ===");

  const { data: plans } = await supabase
    .from("plans")
    .select("id, created_at, floors(name, buildings(name, projects(name)))")
    .order("created_at", { ascending: false });

  console.log(`Total plans in DB: ${plans?.length || 0}`);
  for (const p of plans || []) {
    const fName = p.floors?.name || 'N/A';
    const bName = p.floors?.buildings?.name || '';
    const prName = p.floors?.buildings?.projects?.name || '';
    console.log(`- Plan ID: ${p.id} | Floor: '${fName}' | Building: '${bName}' | Project: '${prName}'`);
  }
}

findElectricalPlan();
