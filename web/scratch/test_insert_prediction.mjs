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

async function testInsertCorrected() {
  console.log("=== TESTING CORRECTED INSERT INTO symbol_predictions ===");
  const testRow = {
    plan_id: "633c788d-fe28-4f0d-97f1-87d2affe9021",
    x_norm: 0.5,
    y_norm: 0.5,
    predicted_symbol_type: "socket",
    confidence: 0.85,
    status: "pending",
    metadata: {
      finalScore: 0.85
    }
  };

  const { data, error } = await supabase.from("symbol_predictions").insert(testRow).select("id");
  if (error) {
    console.error("INSERT ERROR:", error);
  } else {
    console.log("✅ INSERT SUCCESSFUL! Created row ID:", data[0]?.id);

    // Clean up test row
    await supabase.from("symbol_predictions").delete().eq("id", data[0]?.id);
  }
}

testInsertCorrected();
