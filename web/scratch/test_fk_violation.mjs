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

async function testFkViolation() {
  console.log("=== TESTING FK CONSTRAINT ON matched_crop_id ===");
  const testRow = {
    plan_id: "633c788d-fe28-4f0d-97f1-87d2affe9021",
    x_norm: 0.5,
    y_norm: 0.5,
    predicted_symbol_type: "socket",
    confidence: 0.85,
    matched_crop_id: "e33e7a3a-04e1-4232-b84b-a05c8a1131e1", // Prototype ID!
    status: "pending"
  };

  const { data, error } = await supabase.from("symbol_predictions").insert(testRow);
  if (error) {
    console.error("FK TEST ERROR:", error);
  } else {
    console.log("INSERT WITH PROTOTYPE ID WORKED!");
  }
}

testFkViolation();
