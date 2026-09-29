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

async function findSegroHalle4() {
  console.log("=== FINDING PLAN FOR SEGRO FLINGERN / HALLE 4 - EG ===");

  const pIds = ["9134fda1-dbb9-4a8d-af1a-8dfba002dcd1", "45558114-382e-4e5c-a277-2d5532c71f58"];

  const { data: plans } = await supabase
    .from("plans")
    .select("*");

  for (const pl of plans || []) {
    const isSegro = pIds.some(pid => pl.storage_path?.includes(pid));
    if (isSegro) {
      console.log(`- Plan ID: ${pl.id} | Path: ${pl.storage_path} | Metadata:`, pl.metadata || pl.name || pl.title || pl.filename || "no-meta");
    }
  }
}

findSegroHalle4();
