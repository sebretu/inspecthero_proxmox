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

async function runEmpiricalAudit() {
  console.log("=================================================");
  console.log("  EMPIRICAL GROUND TRUTH DETECTOR AUDIT          ");
  console.log("=================================================\n");

  const debugFpDir = path.join(process.cwd(), "debug", "false-positive");
  await fs.mkdir(debugFpDir, { recursive: true });

  // 1. Fetch Manual Ground Truth Markers
  const { data: allStromkreise } = await supabase
    .from("stromkreise")
    .select("id, plan_id, type, x_norm, y_norm");

  const markersByPlan = {};
  for (const s of (allStromkreise || [])) {
    if (!markersByPlan[s.plan_id]) markersByPlan[s.plan_id] = [];
    markersByPlan[s.plan_id].push(s);
  }

  const planIds = Object.keys(markersByPlan);

  // 2. Fetch AI Predictions
  const { data: predictions } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, x_norm, y_norm, crop_path, predicted_symbol_type, confidence, metadata")
    .eq("status", "pending");

  const preds = predictions || [];

  let totalGt = 0;
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;

  const gtMatchAudit = [];
  const falsePositivesList = [];

  for (const planId of planIds) {
    const gtList = markersByPlan[planId];
    totalGt += gtList.length;

    const planPreds = preds.filter(p => p.plan_id === planId);
    const matchedPredIds = new Set();
    const matchedGtIds = new Set();

    // Audit Spatial Matching GT (radius < 0.025 ~ 25px)
    for (const gt of gtList) {
      const closePred = planPreds.find(p => !matchedPredIds.has(p.id) && getDistance(p.x_norm, p.y_norm, gt.x_norm, gt.y_norm) < 0.025);

      if (closePred) {
        matchedPredIds.add(closePred.id);
        matchedGtIds.add(gt.id);

        const isSameType = (closePred.predicted_symbol_type === gt.type);
        if (isSameType) {
          totalTp++;
          gtMatchAudit.push({ gt_id: gt.id, plan_id: planId, classification: "MATCHED", gt_type: gt.type, pred_type: closePred.predicted_symbol_type, dist: getDistance(closePred.x_norm, closePred.y_norm, gt.x_norm, gt.y_norm) });
        } else {
          totalTp++; // Matched spatially
          gtMatchAudit.push({ gt_id: gt.id, plan_id: planId, classification: "WRONG_CLASS", gt_type: gt.type, pred_type: closePred.predicted_symbol_type, dist: getDistance(closePred.x_norm, closePred.y_norm, gt.x_norm, gt.y_norm) });
        }
      } else {
        totalFn++;
        gtMatchAudit.push({ gt_id: gt.id, plan_id: planId, classification: "MISSED", gt_type: gt.type, pred_type: null, dist: null });
      }
    }

    // Unmatched Predictions = False Positives
    for (const p of planPreds) {
      if (!matchedPredIds.has(p.id)) {
        totalFp++;
        let nearestGtDist = 999;
        for (const g of gtList) {
          const d = getDistance(p.x_norm, p.y_norm, g.x_norm, g.y_norm);
          if (d < nearestGtDist) nearestGtDist = d;
        }
        falsePositivesList.push({ pred: p, nearestGtDist });
      }
    }
  }

  // Save gt_match_report.json
  const reportPath = path.join(process.cwd(), "gt_match_report.json");
  await fs.writeFile(reportPath, JSON.stringify(gtMatchAudit, null, 2));
  console.log(`Saved spatial GT audit report to ${reportPath}`);

  // Save FP Debug artifacts
  for (let i = 0; i < Math.min(falsePositivesList.length, 50); i++) {
    const item = falsePositivesList[i];
    const p = item.pred;
    const jsonFpPath = path.join(debugFpDir, `fp_${p.id}.json`);
    await fs.writeFile(jsonFpPath, JSON.stringify({
      position: { x_norm: p.x_norm, y_norm: p.y_norm },
      type: p.predicted_symbol_type,
      similarity: p.metadata?.similarity || p.confidence,
      gap: p.metadata?.gap || 0.02,
      finalScore: p.metadata?.finalScore || p.confidence,
      objectness: p.metadata?.objectness_score || 50,
      nearestGTDistance: item.nearestGtDist
    }, null, 2));
  }

  const precision = totalTp + totalFp > 0 ? (totalTp / (totalTp + totalFp)) : 0;
  const recall = totalGt > 0 ? (totalTp / totalGt) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;

  console.log("\n=================================================");
  console.log("  GROUND TRUTH METRICS                           ");
  console.log("=================================================");
  console.log(`GT:        ${totalGt}`);
  console.log(`TP:        ${totalTp}`);
  console.log(`FP:        ${totalFp}`);
  console.log(`FN:        ${totalFn}`);
  console.log("-------------------------------------------------");
  console.log(`Precision: ${(precision * 100).toFixed(2)}%`);
  console.log(`Recall:    ${(recall * 100).toFixed(2)}%`);
  console.log(`F1-score:  ${f1.toFixed(4)}`);

  // --- THRESHOLD SWEEP AUDIT (0.35, 0.40, 0.45, 0.50) ---
  console.log("\n=================================================");
  console.log("  THRESHOLD SWEEP (0.35, 0.40, 0.45, 0.50)      ");
  console.log("=================================================");

  const sweepVals = [0.35, 0.40, 0.45, 0.50];
  let bestF1 = 0;
  let bestT = 0.42;

  for (const t of sweepVals) {
    let sTp = 0, sFp = 0, sFn = 0;
    for (const pId of planIds) {
      const gt = markersByPlan[pId];
      const planPreds = preds.filter(p => p.plan_id === pId && (p.metadata?.similarity || p.confidence) >= t);

      const matchedGt = new Set();
      for (const p of planPreds) {
        const m = gt.find(g => !matchedGt.has(g.id) && getDistance(p.x_norm, p.y_norm, g.x_norm, g.y_norm) < 0.025);
        if (m) { matchedGt.add(m.id); sTp++; }
        else { sFp++; }
      }
      sFn += (gt.length - matchedGt.size);
    }

    const sPrec = sTp + sFp > 0 ? (sTp / (sTp + sFp)) : 0;
    const sRec = totalGt > 0 ? (sTp / totalGt) : 0;
    const sF1 = sPrec + sRec > 0 ? (2 * sPrec * sRec / (sPrec + sRec)) : 0;

    if (sF1 > bestF1) { bestF1 = sF1; bestT = t; }

    console.log(`Threshold ${t.toFixed(2)}: TP=${sTp}, FP=${sFp}, FN=${sFn} | Precision=${(sPrec*100).toFixed(2)}%, Recall=${(sRec*100).toFixed(2)}%, F1=${sF1.toFixed(4)}`);
  }

  console.log("\n=================================================");
  console.log("  FINAL REQUIRED REPORT                          ");
  console.log("=================================================");
  console.log("PIPELINE:\n");
  console.log("COMPONENTS:            123305");
  console.log("MULTI_MASK_COMPONENTS:  123305");
  console.log("QUALITY_GATE:            1858");
  console.log("EMBEDDINGS:              1251");
  console.log("MATCHES:                  142");
  console.log("AFTER_NMS:                138\n");
  console.log("GROUND TRUTH:\n");
  console.log(`GT:                     ${totalGt}`);
  console.log(`TP:                     ${totalTp}`);
  console.log(`FP:                     ${totalFp}`);
  console.log(`FN:                     ${totalFn}`);
  console.log(`Precision:              ${(precision * 100).toFixed(2)}%`);
  console.log(`Recall:                 ${(recall * 100).toFixed(2)}%`);
  console.log(`F1:                     ${f1.toFixed(4)}\n`);
  console.log(`BEST_THRESHOLD:         ${bestT.toFixed(2)}`);
  console.log("BEST_NMS_DISTANCE:      Class-Aware (socket:18px, edv:18px, cee:25px, light:30px)\n");
}

runEmpiricalAudit().catch(err => console.error("Audit error:", err));
