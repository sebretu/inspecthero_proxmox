const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log("=================================================");
  console.log("  FALSE DETECTION & PIPELINE STAGE AUDIT SCRIPT ");
  console.log("=================================================\n");

  const planId = "b2a2280e-f471-48f6-94f1-5290609ecb52";
  const debugDir = path.join(process.cwd(), "debug", "symbol-detector");
  await fs.mkdir(debugDir, { recursive: true });

  const { data: predictions, error } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, x_norm, y_norm, crop_path, predicted_symbol_type, confidence, metadata")
    .eq("plan_id", planId)
    .eq("status", "pending");

  if (error || !predictions) {
    console.error("Error fetching predictions:", error?.message);
    return;
  }

  console.log(`Total Accepted Predictions in DB for Plan ${planId}: ${predictions.length}`);

  const categories = ["real_symbols", "wall_fragments", "text", "doors", "windows", "lines_dashes", "noise"];
  for (const cat of categories) {
    await fs.mkdir(path.join(debugDir, cat), { recursive: true });
  }

  const catCounts = {
    real_symbols: 0,
    wall_fragments: 0,
    text: 0,
    doors: 0,
    windows: 0,
    lines_dashes: 0,
    noise: 0
  };

  const byTypeCounts = {};

  // Process predictions in parallel batches of 25
  const BATCH_SIZE = 25;
  for (let b = 0; b < predictions.length; b += BATCH_SIZE) {
    const batch = predictions.slice(b, b + BATCH_SIZE);
    await Promise.all(batch.map(async (p, idx) => {
      const globalIdx = b + idx;
      if (!byTypeCounts[p.predicted_symbol_type]) {
        byTypeCounts[p.predicted_symbol_type] = 0;
      }
      byTypeCounts[p.predicted_symbol_type]++;

      let buffer = null;
      try {
        const { data: file } = await supabase.storage.from("symbol-crops").download(p.crop_path);
        if (file) {
          buffer = Buffer.from(await file.arrayBuffer());
        }
      } catch {}

      if (!buffer) return;

      const { data: raw, info } = await sharp(buffer).toFormat("raw").toBuffer({ resolveWithObject: true });
      const w = info.width;
      const h = info.height;
      const ch = info.channels || 3;

      let darkCount = 0;
      let greenCount = 0;
      let minX = w, minY = h, maxX = 0, maxY = 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * ch;
          const r = raw[i], g = raw[i + 1], b = raw[i + 2];
          const lum = (r + g + b) / 3;

          if (lum < 220) {
            darkCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }

          if (g > 60 && g > r + 20 && g > b + 20) {
            greenCount++;
          }
        }
      }

      const boxW = Math.max(1, maxX - minX);
      const boxH = Math.max(1, maxY - minY);
      const aspectRatio = boxW / boxH;
      const bboxFillRatio = darkCount / (boxW * boxH + 1e-5);

      let assignedCat = "noise";

      if (greenCount >= 3 || (p.confidence >= 0.82 && bboxFillRatio >= 0.08 && bboxFillRatio <= 0.45 && boxW >= 15 && boxH >= 15 && boxW <= 110 && boxH <= 110 && aspectRatio >= 0.45 && aspectRatio <= 2.1)) {
        assignedCat = "real_symbols";
      } else if (aspectRatio > 3.8 || aspectRatio < 0.26 || (darkCount > 350 && bboxFillRatio < 0.06)) {
        assignedCat = "wall_fragments";
      } else if (boxH < 18 && boxW > 35 && darkCount < 200) {
        assignedCat = "lines_dashes";
      } else if (darkCount > 60 && darkCount < 300 && (boxH < 22 || boxW < 22)) {
        assignedCat = "text";
      } else if (boxW > 90 && boxH > 90 && bboxFillRatio < 0.04) {
        assignedCat = "doors";
      } else if (aspectRatio >= 0.8 && aspectRatio <= 1.2 && bboxFillRatio < 0.035 && darkCount > 80) {
        assignedCat = "windows";
      } else {
        assignedCat = "noise";
      }

      catCounts[assignedCat]++;

      const thumbName = `pred_${globalIdx}_${p.predicted_symbol_type}_conf${p.confidence.toFixed(2)}.png`;
      const targetPath = path.join(debugDir, assignedCat, thumbName);
      await fs.writeFile(targetPath, buffer).catch(() => {});
    }));
  }

  console.log("\n=================================================");
  console.log("  PREDICTION CLASSIFICATION BREAKDOWN REPORT     ");
  console.log("=================================================");
  console.log(`Total Predictions Analyzed: ${predictions.length}\n`);

  console.log("Grouping by Predicted Symbol Type:");
  for (const [t, c] of Object.entries(byTypeCounts)) {
    console.log(`  - ${t}: ${c}`);
  }

  console.log("\nStructural Content Classification:");
  console.log(`  1. Rzeczywiste symbole (Real Symbols): ${catCounts.real_symbols} (${((catCounts.real_symbols / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  2. Fragmenty ścian (Wall Fragments):   ${catCounts.wall_fragments} (${((catCounts.wall_fragments / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  3. Tekst (Text / Room Labels):         ${catCounts.text} (${((catCounts.text / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  4. Drzwi (Door Openings):              ${catCounts.doors} (${((catCounts.doors / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  5. Okna (Window Frames):              ${catCounts.windows} (${((catCounts.windows / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  6. Kreski (Grid Lines / Dashes):       ${catCounts.lines_dashes} (${((catCounts.lines_dashes / predictions.length)*100).toFixed(1)}%)`);
  console.log(`  7. Szum (Background Noise):           ${catCounts.noise} (${((catCounts.noise / predictions.length)*100).toFixed(1)}%)`);

  const totalFalse = predictions.length - catCounts.real_symbols;
  const falseRatio = (totalFalse / predictions.length) * 100;

  console.log(`\nTotal False Detections (Non-Symbols): ${totalFalse} / ${predictions.length}`);
  console.log(`False Detections Ratio: ${falseRatio.toFixed(1)}%`);

  if (falseRatio > 50) {
    console.log("\n⚠️ RESULT: OVER 50% OF PREDICTIONS ARE NON-SYMBOLS!");
    console.log("CRITICAL NEED FOR PRE-MATCHING `isSymbolCandidate()` STRUCTURAL CLASSIFIER!");
  }

  console.log("\n=================================================");
  console.log("  AUDIT COMPLETED SUCCESSFULY - THUMBNAILS SAVED ");
  console.log("=================================================");
}

runAudit().catch(err => console.error("Audit error:", err));
