import dns from "dns";
dns.setDefaultResultOrder("ipv4first"); // Force IPv4 to prevent Node 18+ fetch hangs on Tailscale IPs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { detectSymbols } from "../src/lib/symbolDetector.ts";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.inspecthero.pl",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

async function test() {
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021'; // OG
  console.log(`[Test-Detection] Loading plan and cleaning up previous predictions for: ${planId}`);

  // Delete previous predictions to check fresh detection scan
  await supabase
    .from("symbol_predictions")
    .delete()
    .eq("plan_id", planId);

  console.log("[Test-Detection] Triggering detectSymbols...");
  const result = await detectSymbols(planId);
  
  console.log("\n==============================================");
  console.log("Detection completed");
  console.log(`Candidates: ${result.detected}`);
  console.log(`Matches (Accepted): ${result.accepted_candidates}`);
  console.log("==============================================\n");

  // Fetch the created predictions from the database
  const { data: predictions, error } = await supabase
    .from("symbol_predictions")
    .select("*")
    .eq("plan_id", planId)
    .order("confidence", { ascending: false });

  if (error) {
    console.error("Failed to fetch predictions from database:", error.message);
    return;
  }

  console.log("Top predictions found in database:");
  (predictions || []).slice(0, 10).forEach((pred, index) => {
    console.log(`${index + 1}.`);
    console.log(`   Type: ${pred.predicted_symbol_type}`);
    console.log(`   Confidence: ${(pred.confidence * 100).toFixed(1)}%`);
    console.log(`   Position: x_norm=${Number(pred.x_norm).toFixed(4)}, y_norm=${Number(pred.y_norm).toFixed(4)}`);
    console.log(`   Status: ${pred.status}`);
  });

  console.log("\n[Test-Detection] Test run finished successfully!");
}

test().catch(console.error);
