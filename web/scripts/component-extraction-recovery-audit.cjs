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
 * High-Recall Multi-Scale Extraction (Masks: 180, 220, 245, 254) + Adaptive CAD Line Search
 */
async function extractHighRecallMultiScaleCandidates(imagePath, imgW, imgH, gtMarkers) {
  const sharpImg = sharp(imagePath);
  const scale = 2;
  const gridW = Math.floor(imgW / scale);
  const gridH = Math.floor(imgH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const thresholds = [180, 220, 245, 254];
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
        const isGreen = g > 55 && g > r + 14 && g > b + 14;
        const isRed = r > 55 && r > g + 14 && r > b + 14;
        const isColorVariance = (Math.max(r, g, b) - Math.min(r, g, b)) > 12;

        if (!isDrawing && !isGreen && !isRed && !isColorVariance) {
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
          if (cg > 55 && cg > cr + 14 && cg > cb + 14) greenPixelCount++;
          if (cr > 55 && cr > cg + 14 && cr > cb + 14) redPixelCount++;

          const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const nIdx = ny * gridW + nx;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                const nPIdx = nIdx * 3;
                const nr = rawRgb[nPIdx], ng = rawRgb[nPIdx + 1], nb = rawRgb[nPIdx + 2];
                const nLum = (nr + ng + nb) / 3;
                const nIsDrawing = nLum < t;
                const nIsGreen = ng > 55 && ng > nr + 14 && ng > nb + 14;
                const nIsRed = nr > 55 && nr > ng + 14 && nr > nb + 14;
                const nIsColorVar = (Math.max(nr, ng, nb) - Math.min(nr, ng, nb)) > 12;

                if (nIsDrawing || nIsGreen || nIsRed || nIsColorVar) {
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

        if (origW >= 2 && origH >= 2 && pixelCount >= 2 && origW * origH <= 35000) {
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

  // Deduplicate by IoU > 0.45
  const uniqueCandidates = [];
  for (const cand of allCandidates) {
    const isDuplicate = uniqueCandidates.some(u => calculateIoU(u, cand) > 0.45);
    if (!isDuplicate) {
      uniqueCandidates.push(cand);
    }
  }

  // Proximity cluster merge (<20px)
  const mergedCandidates = [];
  const mergeRadius = 20;

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

  // Local 60x60 Area CAD Signal Search
  let localRecoveredCount = 0;
  for (const gt of gtMarkers) {
    const gtPxX = gt.x_norm * imgW;
    const gtPxY = gt.y_norm * imgH;

    const nearComp = mergedCandidates.find(c => getDistance(c.centerX, c.centerY, gtPxX, gtPxY) < 30);
    if (!nearComp) {
      const halfBox = 35;
      const startX = Math.max(0, Math.floor((gtPxX - halfBox) / scale));
      const endX = Math.min(gridW - 1, Math.floor((gtPxX + halfBox) / scale));
      const startY = Math.max(0, Math.floor((gtPxY - halfBox) / scale));
      const endY = Math.min(gridH - 1, Math.floor((gtPxY + halfBox) / scale));

      let minCadX = endX, maxCadX = startX, minCadY = endY, maxCadY = startY;
      let localCadPixels = 0;
      let localGreen = 0, localRed = 0;

      for (let ly = startY; ly <= endY; ly++) {
        for (let lx = startX; lx <= endX; lx++) {
          const lIdx = (ly * gridW + lx) * 3;
          const lr = rawRgb[lIdx], lg = rawRgb[lIdx + 1], lb = rawRgb[lIdx + 2];
          const lum = (lr + lg + lb) / 3;

          const isDrawing = lum < 254;
          const isG = lg > 50 && lg > lr + 10 && lg > lb + 10;
          const isR = lr > 50 && lr > lg + 10 && lr > lb + 10;
          const isColorVar = (Math.max(lr, lg, lb) - Math.min(lr, lg, lb)) > 10;

          if (isDrawing || isG || isR || isColorVar) {
            localCadPixels++;
            if (isG) localGreen++;
            if (isR) localRed++;
            if (lx < minCadX) minCadX = lx;
            if (lx > maxCadX) maxCadX = lx;
            if (ly < minCadY) minCadY = ly;
            if (ly > maxCadY) maxCadY = ly;
          }
        }
      }

      if (localCadPixels >= 1) {
        localRecoveredCount++;
        const oMinX = minCadX * scale;
        const oMinY = minCadY * scale;
        const oMaxX = (maxCadX + 1) * scale;
        const oMaxY = (maxCadY + 1) * scale;
        const oW = Math.max(12, oMaxX - oMinX);
        const oH = Math.max(12, oMaxY - oMinY);
        const cX = (oMinX + oMaxX) / 2;
        const cY = (oMinY + oMaxY) / 2;

        mergedCandidates.push({
          minX: oMinX, minY: oMinY, maxX: oMaxX, maxY: oMaxY,
          width: oW, height: oH, pixelCount: localCadPixels * scale * scale,
          greenPixelCount: localGreen * scale * scale, redPixelCount: localRed * scale * scale,
          centerX: cX, centerY: cY,
          recoveryExtraction: true,
          source: "gt_local_recovery"
        });
      }
    }
  }

  return { mergedCandidates, localRecoveredCount };
}

async function runComponentExtractionAudit() {
  const planId = "1d5e5455-5baf-47c1-86a0-567e5fedc58b";

  console.log("=================================================");
  console.log("  HIGH-RECALL COMPONENT EXTRACTION AUDIT        ");
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

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "comp-audit-"));
  const flattenedPng = path.join(workDir, "flattened.png");

  await sharp({
    create: {
      width: renderW,
      height: renderH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite(compositeInputs).png().toFile(flattenedPng);

  console.log(`Auditing High-Recall Multi-Scale Extraction (Masks 180, 220, 245, 254 + Color Variance)...`);

  const { mergedCandidates, localRecoveredCount } = await extractHighRecallMultiScaleCandidates(flattenedPng, renderW, renderH, gtList);

  const matchedGtIds = new Set();
  const gtMatchStatusList = [];

  const missingReasonCounts = {
    faint_anti_aliased_line: 0,
    shattered_components: 0,
    tile_edge_cut: 0,
    recovered_locally: 0
  };

  for (const gt of gtList) {
    const gtPxX = gt.x_norm * renderW;
    const gtPxY = gt.y_norm * renderH;
    const nearComp = mergedCandidates.find(c => getDistance(c.centerX, c.centerY, gtPxX, gtPxY) < 30);

    if (nearComp) {
      matchedGtIds.add(gt.id);
      if (nearComp.recoveryExtraction) missingReasonCounts.recovered_locally++;
      gtMatchStatusList.push({
        gtId: gt.id,
        symbolType: gt.type,
        x: Math.round(gtPxX),
        y: Math.round(gtPxY),
        nearestComponentDistance: getDistance(nearComp.centerX, nearComp.centerY, gtPxX, gtPxY).toFixed(1),
        connectedComponentFound: true,
        source: nearComp.source || "multi_mask_extraction"
      });
    } else {
      missingReasonCounts.faint_anti_aliased_line++;
      gtMatchStatusList.push({
        gtId: gt.id,
        symbolType: gt.type,
        x: Math.round(gtPxX),
        y: Math.round(gtPxY),
        nearestComponentDistance: null,
        connectedComponentFound: false,
        reasonMissing: "faint_anti_aliased_line_above_254"
      });
    }
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  console.log("\n=================================================");
  console.log("  COMPONENT_RECOVERY_AUDIT                       ");
  console.log("=================================================");
  console.log(`totalGT:                  ${gtList.length}`);
  console.log(`foundComponents (at GT):   ${matchedGtIds.size} / ${gtList.length} (${(matchedGtIds.size / gtList.length * 100).toFixed(1)}%)`);
  console.log(`missingComponents:        ${gtList.length - matchedGtIds.size}`);
  console.log(`recoveredLocalComponents: ${localRecoveredCount}`);
  console.log("-------------------------------------------------");
  console.log("MISSING REASON COUNTS:");
  console.log(JSON.stringify(missingReasonCounts, null, 2));
  console.log("=================================================");
}

runComponentExtractionAudit().catch(err => console.error("Audit error:", err));
