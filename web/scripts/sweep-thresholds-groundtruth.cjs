const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

async function runThresholdSweep() {
  console.log("=================================================");
  console.log("  GROUND TRUTH THRESHOLD SWEEP (0.50, 0.45, 0.40)");
  console.log("=================================================\n");

  const { data: allStromkreise } = await supabase
    .from("stromkreise")
    .select("plan_id, type, x_norm, y_norm");

  const markersByPlan = {};
  for (const s of (allStromkreise || [])) {
    if (!markersByPlan[s.plan_id]) markersByPlan[s.plan_id] = [];
    markersByPlan[s.plan_id].push(s);
  }

  const planIds = Object.keys(markersByPlan);
  console.log(`Auditing ${planIds.length} Ground Truth plans across threshold values...\n`);

  const { data: predictions } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, x_norm, y_norm, crop_path, predicted_symbol_type, confidence, metadata")
    .eq("status", "pending");

  const preds = predictions || [];

  const thresholdsToTest = [0.50, 0.45, 0.40];

  for (const t of thresholdsToTest) {
    let totalGt = 0;
    let totalTp = 0;
    let totalFp = 0;

    for (const pId of planIds) {
      const gt = markersByPlan[pId];
      totalGt += gt.length;

      const planPreds = preds.filter(p => p.plan_id === pId && (p.metadata?.similarity || p.confidence) >= t);

      const matchedGtIds = new Set();
      let tp = 0;
      let fp = 0;

      for (const pred of planPreds) {
        const match = gt.find(g => !matchedGtIds.has(g.id) && getDistance(pred.x_norm, pred.y_norm, g.x_norm, g.y_norm) < 0.028);
        if (match) {
          matchedGtIds.add(match.id);
          tp++;
        } else {
          fp++;
        }
      }

      totalTp += tp;
      totalFp += fp;
    }

    const prec = totalTp + totalFp > 0 ? (totalTp / (totalTp + totalFp)) * 100 : 0;
    const rec = totalGt > 0 ? (totalTp / totalGt) * 100 : 0;

    console.log(`Threshold ${t.toFixed(2)}:`);
    console.log(`  - True Positives (TP):  ${totalTp}`);
    console.log(`  - False Positives (FP): ${totalFp}`);
    console.log(`  - Precision:           ${prec.toFixed(2)}%`);
    console.log(`  - Recall:              ${rec.toFixed(2)}%\n`);
  }
}

runThresholdSweep().catch(err => console.error("Sweep error:", err));
