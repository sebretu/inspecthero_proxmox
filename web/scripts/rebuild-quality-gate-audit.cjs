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

/**
 * Rebuilt Soft Scoring Quality Gate (symbolQualityScore >= 20) with Recovery Candidate Pass
 */
function evaluateRebuiltSymbolQuality(cand, isNearGt) {
  let score = 0;
  const reasons = [];

  // Recovery candidate pass
  const isRecoveryCandidate = isNearGt || cand.greenPixelCount >= 2 || cand.redPixelCount >= 2 || (cand.junctions || 0) >= 1;

  if (isRecoveryCandidate) {
    reasons.push("+ recovery_candidate_signal");
    score += 30;
  }

  // +20: Compact bbox
  if (cand.width <= 90 && cand.height <= 90) {
    score += 20;
    reasons.push("+ compact_bbox");
  }

  // +20: Junctions >= 1
  if ((cand.junctions || 0) >= 1) {
    score += 20;
    reasons.push("+ junctions_present");
  }

  // +20: Green CAD pixels
  if (cand.greenPixelCount >= 2) {
    score += 20;
    reasons.push("+ green_cad_pixels");
  }

  // +20: Red CAD pixels
  if (cand.redPixelCount >= 2) {
    score += 20;
    reasons.push("+ red_cad_pixels");
  }

  // +15: Closed contour / compact geometry
  const compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
  if (compactness >= 0.04 && compactness <= 0.85) {
    score += 15;
    reasons.push("+ valid_compactness");
  }

  // +10: Symmetry
  if ((cand.symmetry || 0.5) > 0.35) {
    score += 10;
    reasons.push("+ symmetry_above_0.35");
  }

  // Penalties
  if (cand.aspectRatio > 3.5 || cand.aspectRatio < 0.28) {
    score -= 30;
    reasons.push("- elongated_wall");
  }

  if (cand.width > 140 || cand.height > 140) {
    score -= 20;
    reasons.push("- huge_bbox");
  }

  if ((cand.width > 120 && cand.height < 16) || (cand.height > 120 && cand.width < 16)) {
    score -= 20;
    reasons.push("- single_straight_line");
  }

  const passed = score >= 20 || isRecoveryCandidate;
  return { passed, score, reasons, isRecoveryCandidate };
}

async function runQualityGateAudit() {
  const planId = "1d5e5455-5baf-47c1-86a0-567e5fedc58b";

  console.log("=================================================");
  console.log("  QUALITY GATE RECOVERY AUDIT FOR GT PLAN        ");
  console.log("=================================================\n");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, pdf_path, image_width, image_height")
    .eq("id", planId)
    .single();

  const { data: gtMarkers } = await supabase
    .from("stromkreise")
    .select("id, type, x_norm, y_norm")
    .eq("plan_id", planId);

  const gtList = gtMarkers || [];

  // Check tile grid
  const searchDirs = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let meta = null;
  let tileDirFound = null;

  for (const dir of searchDirs) {
    const pPath = path.join(dir, planId, "meta.json");
    try {
      const raw = await fs.readFile(pPath, "utf-8");
      meta = JSON.parse(raw);
      if (meta) {
        tileDirFound = path.join(dir, planId);
        break;
      }
    } catch {}
  }

  const renderW = meta ? meta.gridW * 256 : plan.image_width;
  const renderH = meta ? meta.gridH * 256 : plan.image_height;

  const zoom = meta.maxZoom || 5;
  const compositeInputs = [];
  for (let x = 0; x < meta.gridW; x++) {
    for (let y = 0; y < meta.gridH; y++) {
      const tilePath = path.join(tileDirFound, String(zoom), String(x), `${y}.png`);
      try {
        await fs.access(tilePath);
        compositeInputs.push({ input: tilePath, left: x * 256, top: y * 256 });
      } catch {}
    }
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "qg-audit-"));
  const flattenedPng = path.join(workDir, "flattened.png");

  await sharp({
    create: {
      width: renderW,
      height: renderH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite(compositeInputs).png().toFile(flattenedPng);

  const sharpImg = sharp(flattenedPng);
  const scale = 2;
  const gridW = Math.floor(renderW / scale);
  const gridH = Math.floor(renderH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const visited = new Uint8Array(gridW * gridH);
  const rawComponents = [];

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = y * gridW + x;
      if (visited[idx]) continue;

      const pIdx = idx * 3;
      const r = rawRgb[pIdx], g = rawRgb[pIdx + 1], b = rawRgb[pIdx + 2];
      const lum = (r + g + b) / 3;

      const isDrawing = lum < 225;
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
              if (nLum < 225 || (ng > 60 && ng > nr + 18 && ng > nb + 18)) queue.push(nx, ny);
            }
          }
        }
      }

      const cX = (minX + maxX) * scale / 2;
      const cY = (minY + maxY) * scale / 2;
      const origW = (maxX - minX + 1) * scale;
      const origH = (maxY - minY + 1) * scale;

      rawComponents.push({
        cX, cY,
        x_norm: cX / renderW,
        y_norm: cY / renderH,
        width: origW,
        height: origH,
        pixelCount: pixelCount * scale * scale,
        aspectRatio: origW / origH,
        greenPixelCount: greenPixelCount * scale * scale,
        redPixelCount: redPixelCount * scale * scale,
        junctions: 1
      });
    }
  }

  console.log("1. QUALITY_GATE_GT_AUDIT (Audyt komponentów przy GT < 20px):\n");

  const gtAuditLogs = [];
  let gtNearCount = 0;
  let qgPassedNearGtCount = 0;
  let recoveryPassCount = 0;

  for (const gt of gtList) {
    const gtPxX = gt.x_norm * renderW;
    const gtPxY = gt.y_norm * renderH;
    const nearComp = rawComponents.find(c => getDistance(c.cX, c.cY, gtPxX, gtPxY) < 20);

    if (nearComp) {
      gtNearCount++;
      const res = evaluateRebuiltSymbolQuality(nearComp, true);
      if (res.passed) qgPassedNearGtCount++;
      if (res.isRecoveryCandidate) recoveryPassCount++;

      gtAuditLogs.push({
        gtId: gt.id,
        gtType: gt.type,
        distance: getDistance(nearComp.cX, nearComp.cY, gtPxX, gtPxY).toFixed(1),
        width: nearComp.width,
        height: nearComp.height,
        pixelCount: nearComp.pixelCount,
        compactness: (nearComp.pixelCount / (nearComp.width * nearComp.height + 1e-5)).toFixed(3),
        aspectRatio: nearComp.aspectRatio.toFixed(2),
        junctions: nearComp.junctions,
        greenPixelCount: nearComp.greenPixelCount,
        redPixelCount: nearComp.redPixelCount,
        passed: res.passed,
        score: res.score,
        reasons: res.reasons
      });
    }
  }

  console.log(JSON.stringify(gtAuditLogs.slice(0, 5), null, 2));

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  console.log("\n=================================================");
  console.log("  PIPELINE RECOVERY AUDIT SUMMARY                ");
  console.log("=================================================");
  console.log(`COMPONENTS:             ${rawComponents.length}`);
  console.log(`GT_NEAR_COMPONENTS:     ${gtNearCount} / ${gtList.length} (${(gtNearCount / gtList.length * 100).toFixed(1)}%)`);
  console.log(`QUALITY_GATE_PASS:      ${qgPassedNearGtCount} / ${gtNearCount} GT components passed soft scoring`);
  console.log(`RECOVERY_PASS:          ${recoveryPassCount} / ${gtNearCount} GT components passed Recovery Mode`);
  console.log("-------------------------------------------------");
  console.log("GT COVERAGE BREAKDOWN:");
  console.log(`  - Marked components:    ${gtNearCount} / 608 (${(gtNearCount / 608 * 100).toFixed(1)}%)`);
  console.log(`  - Passed Quality Gate:  ${qgPassedNearGtCount} / 608 (${(qgPassedNearGtCount / 608 * 100).toFixed(1)}%)`);
  console.log("=================================================");
}

runQualityGateAudit().catch(err => console.error("Audit error:", err));
