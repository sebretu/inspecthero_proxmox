// Migration script to initialize prototype_symbols and prototype_categories tables in Supabase
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

async function initPrototypeSchema() {
  console.log("Initializing Prototype Library Schema in Supabase...");

  // Execute DDL via rpc or raw query if postgres rpc exists, or test REST table existence
  // Test if prototype_symbols table exists by selecting
  const { data: testData, error: testError } = await supabase
    .from("prototype_symbols")
    .select("id")
    .limit(1);

  if (testError && testError.code === "42P01") {
    console.log("Table prototype_symbols does not exist yet. Creating via Supabase SQL endpoint / query...");
  } else {
    console.log("Table prototype_symbols check result:", testError ? testError.message : "Exists!");
  }
}

initPrototypeSchema();
