const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectCoordinates() {
  const planId = "1d5e5455-5baf-47c1-86a0-567e5fedc58b";

  const { data: plan } = await supabase
    .from("plans")
    .select("image_width, image_height")
    .eq("id", planId)
    .single();

  console.log(`PLAN ${planId} DB Metadata:`, plan);

  const { data: gt } = await supabase
    .from("stromkreise")
    .select("id, type, x_norm, y_norm")
    .eq("plan_id", planId)
    .limit(10);

  const { data: preds } = await supabase
    .from("symbol_predictions")
    .select("id, predicted_symbol_type, x_norm, y_norm, confidence, metadata")
    .eq("plan_id", planId)
    .limit(10);

  console.log("\n--- GROUND TRUTH MARKERS (stromkreise) ---");
  for (const g of (gt || [])) {
    const px = Math.round(g.x_norm * (plan.image_width || 7021));
    const py = Math.round(g.y_norm * (plan.image_height || 4967));
    console.log(`GT [${g.type}] (${g.id}): x_norm=${g.x_norm.toFixed(4)}, y_norm=${g.y_norm.toFixed(4)} -> Pixel (${px}, ${py})`);
  }

  console.log("\n--- AI PREDICTIONS (symbol_predictions) ---");
  for (const p of (preds || [])) {
    const px = Math.round(p.x_norm * (plan.image_width || 7021));
    const py = Math.round(p.y_norm * (plan.image_height || 4967));
    console.log(`PRED [${p.predicted_symbol_type}] (${p.id}): x_norm=${p.x_norm.toFixed(4)}, y_norm=${p.y_norm.toFixed(4)} -> Pixel (${px}, ${py}) | conf=${p.confidence}`);
  }
}

inspectCoordinates().catch(err => console.error("Inspect error:", err));
