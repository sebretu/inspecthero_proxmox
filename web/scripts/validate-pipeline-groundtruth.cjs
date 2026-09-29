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

async function runGroundTruthValidation() {
  console.log("=================================================");
  console.log("  OBJECTNESS PIPELINE GROUND TRUTH VALIDATION   ");
  console.log("=================================================\n");

  const debugDir = path.join(process.cwd(), "debug", "validation");
  const fpDir = path.join(debugDir, "false_positives");
  const fnDir = path.join(debugDir, "false_negatives");
  await fs.mkdir(fpDir, { recursive: true });
  await fs.mkdir(fnDir, { recursive: true });

  // Query plans that have manual ground truth markers in stromkreise
  const { data: allStromkreise } = await supabase
    .from("stromkreise")
    .select("plan_id, type, x_norm, y_norm");

  const markersByPlan = {};
  for (const s of (allStromkreise || [])) {
    if (!markersByPlan[s.plan_id]) markersByPlan[s.plan_id] = [];
    markersByPlan[s.plan_id].push(s);
  }

  const planIds = Object.keys(markersByPlan);
  console.log(`Found ${planIds.length} plans with manual Ground Truth markers in DB.\n`);

  let totalGtAllPlans = 0;
  let totalTpAllPlans = 0;
  let totalFpAllPlans = 0;
  let totalFnAllPlans = 0;

  for (const planId of planIds) {
    const { data: plan } = await supabase.from("plans").select("name").eq("id", planId).maybeSingle();
    const planName = plan?.name || planId;

    const gtMarkers = markersByPlan[planId];
    totalGtAllPlans += gtMarkers.length;

    const { data: predictions } = await supabase
      .from("symbol_predictions")
      .select("id, x_norm, y_norm, crop_path, predicted_symbol_type, confidence, metadata")
      .eq("plan_id", planId);

    const preds = predictions || [];

    const matchRadius = 0.028;
    const matchedGtIds = new Set();
    const tpList = [];
    const fpList = [];

    for (const p of preds) {
      const matchedGt = gtMarkers.find(gt => 
        !matchedGtIds.has(gt.id) && getDistance(p.x_norm, p.y_norm, gt.x_norm, gt.y_norm) < matchRadius
      );

      if (matchedGt) {
        matchedGtIds.add(matchedGt.id);
        tpList.push({ prediction: p, groundTruth: matchedGt });
      } else {
        fpList.push(p);
      }
    }

    const fnList = gtMarkers.filter(gt => !matchedGtIds.has(gt.id));

    totalTpAllPlans += tpList.length;
    totalFpAllPlans += fpList.length;
    totalFnAllPlans += fnList.length;

    const planPrec = tpList.length + fpList.length > 0 ? (tpList.length / (tpList.length + fpList.length)) * 100 : 0;
    const planRec = gtMarkers.length > 0 ? (tpList.length / gtMarkers.length) * 100 : 0;

    console.log(`Plan [${planName}] (${planId}):`);
    console.log(`  - Real Symbols (Ground Truth): ${gtMarkers.length}`);
    console.log(`  - True Positives (TP):        ${tpList.length}`);
    console.log(`  - False Positives (FP):       ${fpList.length}`);
    console.log(`  - False Negatives (FN):       ${fnList.length}`);
    console.log(`  - Precision: ${planPrec.toFixed(1)}%, Recall: ${planRec.toFixed(1)}%\n`);
  }

  const overallPrecision = totalTpAllPlans + totalFpAllPlans > 0 ? (totalTpAllPlans / (totalTpAllPlans + totalFpAllPlans)) : 0;
  const overallRecall = totalGtAllPlans > 0 ? (totalTpAllPlans / totalGtAllPlans) : 0;
  const overallF1 = overallPrecision + overallRecall > 0 ? (2 * overallPrecision * overallRecall / (overallPrecision + overallRecall)) : 0;

  console.log("=================================================");
  console.log("  OVERALL GROUND TRUTH VALIDATION SUMMARY        ");
  console.log("=================================================");
  console.log(`TOTAL REAL SYMBOLS (GT): ${totalGtAllPlans}`);
  console.log(`TOTAL TRUE POSITIVES (TP): ${totalTpAllPlans}`);
  console.log(`TOTAL FALSE POSITIVES (FP): ${totalFpAllPlans}`);
  console.log(`TOTAL FALSE NEGATIVES (FN): ${totalFnAllPlans}`);
  console.log("-------------------------------------------------");
  console.log(`OVERALL PRECISION:        ${(overallPrecision * 100).toFixed(2)}%`);
  console.log(`OVERALL RECALL:           ${(overallRecall * 100).toFixed(2)}%`);
  console.log(`OVERALL F1-SCORE:         ${overallF1.toFixed(4)}`);

  console.log("\n=================================================");
  console.log("  DIAGNOSTIC BOTTLENECK CONCLUSION               ");
  console.log("=================================================");

  if (totalFpAllPlans > totalTpAllPlans * 2) {
    console.log("MAIN ISSUE IDENTIFIED: 1. ZBYT DUŻO FALSE POSITIVES (Za dużo fałszywych predykcji).");
  } else if (overallRecall < 0.60) {
    console.log("MAIN ISSUE IDENTIFIED: 2. ZBYT NISKI RECALL (Pominięte prawdziwe symbole).");
  } else {
    console.log("MAIN ISSUE IDENTIFIED: 3. BŁĘDNA KLASYFIKACJA PGVECTOR (Mylenie typów symboli).");
  }

  console.log("\n=================================================");
  console.log("  VALIDATION AUDIT COMPLETED SUCCESSFULLY        ");
  console.log("=================================================");
}

runGroundTruthValidation().catch(err => console.error("Validation error:", err));
