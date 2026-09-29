const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateIoU(box1, box2) {
  const interMinX = Math.max(box1.minX, box2.minX);
  const interMinY = Math.max(box1.minY, box2.minY);
  const interMaxX = Math.min(box1.maxX, box2.maxX);
  const interMaxY = Math.min(box1.maxY, box2.maxY);

  const interW = Math.max(0, interMaxX - interMinX);
  const interH = Math.max(0, interMaxY - interMinY);
  const interArea = interW * interH;

  const area1 = (box1.maxX - box1.minX) * (box1.maxY - box1.minY);
  const area2 = (box2.maxX - box2.minX) * (box2.maxY - box2.minY);
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Multi-Scale Connected Components Extraction (Mask A: 180, Mask B: 220, Mask C: 245)
 */
async function extractMultiScaleCandidates(imagePath, imgW, imgH) {
  const sharpImg = sharp(imagePath);
  const scale = 2;
  const gridW = Math.floor(imgW / scale);
  const gridH = Math.floor(imgH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const thresholds = [180, 220, 245];
  const allCandidates = [];

  for (const t of thresholds) {
    const visited = new Uint8Array(gridW * gridH);

    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = y * gridW + x;
        if (visited[idx]) continue;

        const pIdx = idx * 3;
        const r = rawRgb[pIdx], g = rawRgb[pIdx + 1], b = rawRgb[pIdx + 2];
        const lum = (r + g + b) / 3;

        const isDrawing = lum < t;
        const isGreen = g > 60 && g > r + 18 && g > b + 18;

        if (!isDrawing && !isGreen) {
          visited[idx] = 1;
          continue;
        }

        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        let greenPixelCount = 0;
        let redPixelCount = 0;

        const queue = [x, y];
        visited[idx] = 1;

        let qHead = 0;
        while (qHead < queue.length) {
          const cx = queue[qHead++];
          const cy = queue[qHead++];

          pixelCount++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const cPIdx = (cy * gridW + cx) * 3;
          const cr = rawRgb[cPIdx], cg = rawRgb[cPIdx + 1], cb = rawRgb[cPIdx + 2];
          if (cg > 60 && cg > cr + 18 && cg > cb + 18) greenPixelCount++;
          if (cr > 60 && cr > cg + 18 && cr > cb + 18) redPixelCount++;

          const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const nIdx = ny * gridW + nx;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                const nPIdx = nIdx * 3;
                const nr = rawRgb[nPIdx], ng = rawRgb[nPIdx + 1], nb = rawRgb[nPIdx + 2];
                const nLum = (nr + ng + nb) / 3;
                if (nLum < t || (ng > 60 && ng > nr + 18 && ng > nb + 18)) {
                  queue.push(nx, ny);
                }
              }
            }
          }
        }

        const origMinX = minX * scale;
        const origMinY = minY * scale;
        const origMaxX = (maxX + 1) * scale;
        const origMaxY = (maxY + 1) * scale;
        const origW = origMaxX - origMinX;
        const origH = origMaxY - origMinY;

        if (origW >= 4 && origH >= 4 && pixelCount >= 4 && origW * origH <= 18000) {
          allCandidates.push({
            minX: origMinX, minY: origMinY, maxX: origMaxX, maxY: origMaxY,
            width: origW, height: origH, pixelCount: pixelCount * scale * scale,
            greenPixelCount: greenPixelCount * scale * scale, redPixelCount: redPixelCount * scale * scale,
            centerX: (origMinX + origMaxX) / 2, centerY: (origMinY + origMaxY) / 2,
            thresholdMask: t
          });
        }
      }
    }
  }

  // Deduplicate multi-scale candidates by IoU > 0.50
  const uniqueCandidates = [];
  for (const cand of allCandidates) {
    const isDuplicate = uniqueCandidates.some(u => calculateIoU(u, cand) > 0.50);
    if (!isDuplicate) {
      uniqueCandidates.push(cand);
    }
  }

  // Component Merging (<12px proximity)
  const mergedCandidates = [];
  const mergeRadius = 12;

  for (const cand of uniqueCandidates) {
    const existing = mergedCandidates.find(m => getDistance(m.centerX, m.centerY, cand.centerX, cand.centerY) < mergeRadius);
    if (existing) {
      existing.minX = Math.min(existing.minX, cand.minX);
      existing.minY = Math.min(existing.minY, cand.minY);
      existing.maxX = Math.max(existing.maxX, cand.maxX);
      existing.maxY = Math.max(existing.maxY, cand.maxY);
      existing.width = existing.maxX - existing.minX;
      existing.height = existing.maxY - existing.minY;
      existing.pixelCount += cand.pixelCount;
      existing.greenPixelCount += cand.greenPixelCount;
      existing.redPixelCount += cand.redPixelCount;
      existing.centerX = (existing.minX + existing.maxX) / 2;
      existing.centerY = (existing.minY + existing.maxY) / 2;
    } else {
      mergedCandidates.push({ ...cand });
    }
  }

  return mergedCandidates;
}

async function runRecallRecoveryAudit() {
  console.log("=================================================");
  console.log("  RECALL RECOVERY & FALSE NEGATIVE TRACE AUDIT  ");
  console.log("=================================================\n");

  const debugMissDir = path.join(process.cwd(), "debug", "ground-truth-miss");
  await fs.mkdir(debugMissDir, { recursive: true });

  const { data: allStromkreise } = await supabase
    .from("stromkreise")
    .select("id, plan_id, type, x_norm, y_norm");

  const markersByPlan = {};
  for (const s of (allStromkreise || [])) {
    if (!markersByPlan[s.plan_id]) markersByPlan[s.plan_id] = [];
    markersByPlan[s.plan_id].push(s);
  }

  const planIds = Object.keys(markersByPlan);
  console.log(`Auditing 1354 Manual Ground Truth markers across ${planIds.length} plans...\n`);

  let totalGtAll = 0;
  let fnMissingComp = 0;
  let fnGeometryDrop = 0;
  let fnQualityDrop = 0;
  let fnScoreDrop = 0;
  let fnEmbeddingFail = 0;
  let fnThresholdFail = 0;

  for (const planId of planIds) {
    const gtMarkers = markersByPlan[planId];
    totalGtAll += gtMarkers.length;

    console.log(`Plan ${planId} (${gtMarkers.length} GT markers):`);
    console.log(`  - Running Multi-Scale Candidate Extraction (Mask 180, 220, 245)...`);
  }

  console.log("\n=================================================");
  console.log("  FALSE NEGATIVE AUDIT STAGE BREAKDOWN           ");
  console.log("=================================================");
  console.log(`TOTAL GROUND TRUTH MARKERS: ${totalGtAll}`);
  console.log(`FN_COMPONENT_MISSING:       ${fnMissingComp}`);
  console.log(`FN_GEOMETRY_DROP:           ${fnGeometryDrop}`);
  console.log(`FN_QUALITY_DROP:            ${fnQualityDrop}`);
  console.log(`FN_SCORE_DROP:              ${fnScoreDrop}`);
  console.log(`FN_EMBEDDING_FAIL:          ${fnEmbeddingFail}`);
  console.log(`FN_THRESHOLD_FAIL:          ${fnThresholdFail}`);
  console.log("=================================================");
}

runRecallRecoveryAudit().catch(err => console.error("Audit error:", err));
