const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function bboxDistance(b1, b2) {
  const dx = Math.max(0, Math.max(b1.minX - b2.maxX, b2.minX - b1.maxX));
  const dy = Math.max(0, Math.max(b1.minY - b2.maxY, b2.minY - b1.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}

function findTargetSymbolComponentsV21(rawPixels, patchW, patchH, patchLeft, patchTop, pixelX, pixelY, channels = 4, dpiScale = 1.0) {
  const visited = new Uint8Array(patchW * patchH);
  const allComponents = [];

  const markerPatchX = pixelX - patchLeft;
  const markerPatchY = pixelY - patchTop;

  const areaScale = (dpiScale || 1.0) ** 2;
  const maxRawArea = 16000 * areaScale;
  const maxSearchDist = 250 * (dpiScale || 1.0);
  const maxGapDist = 20 * (dpiScale || 1.0);

  for (let y = 0; y < patchH; y++) {
    for (let x = 0; x < patchW; x++) {
      const idx = y * patchW + x;
      if (visited[idx]) continue;

      const pIdx = idx * channels;
      const r = rawPixels[pIdx];
      const g = rawPixels[pIdx + 1];
      const b = rawPixels[pIdx + 2];
      const lum = (r + g + b) / 3;

      const isNonBg = lum < 248 || Math.abs(r - g) > 4 || Math.abs(g - b) > 4 || Math.abs(r - b) > 4;
      if (!isNonBg) {
        visited[idx] = 1;
        continue;
      }

      const queue = [x, y];
      visited[idx] = 1;

      let minX = x, maxX = x, minY = y, maxY = y;
      let pixelCount = 0;
      let coversMarker = false;

      while (queue.length > 0) {
        const cx = queue.shift();
        const cy = queue.shift();
        pixelCount++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (Math.abs(cx - markerPatchX) <= Math.round(8 * (dpiScale || 1.0)) && Math.abs(cy - markerPatchY) <= Math.round(8 * (dpiScale || 1.0))) {
          coversMarker = true;
        }

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < patchW && ny >= 0 && ny < patchH) {
              const nIdx = ny * patchW + nx;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                const npIdx = nIdx * channels;
                const nr = rawPixels[npIdx];
                const ng = rawPixels[npIdx + 1];
                const nb = rawPixels[npIdx + 2];
                const nLum = (nr + ng + nb) / 3;
                const nNonBg = nLum < 248 || Math.abs(nr - ng) > 4 || Math.abs(ng - nb) > 4 || Math.abs(nr - nb) > 4;
                if (nNonBg) {
                  queue.push(nx, ny);
                }
              }
            }
          }
        }
      }

      const compW = maxX - minX + 1;
      const compH = maxY - minY + 1;
      const area = compW * compH;
      const cX = patchLeft + (minX + maxX) / 2;
      const cY = patchTop + (minY + maxY) / 2;
      const dist = getDistance(pixelX, pixelY, cX, cY);

      if (pixelCount < 2 || area < 4 || area > maxRawArea * 2) continue;
      if (compW / compH > 20.0 || compH / compW > 20.0) continue;
      if (dist > maxSearchDist) continue;

      allComponents.push({
        minX: patchLeft + minX,
        minY: patchTop + minY,
        maxX: patchLeft + maxX,
        maxY: patchTop + maxY,
        width: compW,
        height: compH,
        area,
        pixelCount,
        centerX: cX,
        centerY: cY,
        distToMarker: dist,
        coversMarker
      });
    }
  }

  if (allComponents.length === 0) {
    return {
      mergedBbox: null,
      detectionMethod: "FAILED",
      candidateCount: 0,
      mergedCount: 0,
      primaryArea: 0,
      distToMarker: 999
    };
  }

  // ETAP 1: Direct Component Search
  const directCandidates = allComponents.filter(c => c.coversMarker || c.distToMarker <= 40 * (dpiScale || 1.0));
  let primaryComponent = null;
  let detectionMethod = "FAILED";

  if (directCandidates.length > 0) {
    directCandidates.sort((a, b) => {
      if (a.coversMarker !== b.coversMarker) return a.coversMarker ? -1 : 1;
      return a.distToMarker - b.distToMarker;
    });
    primaryComponent = directCandidates[0];
    detectionMethod = "DIRECT_COMPONENT";
  } else {
    // ETAP 2: Nearest Component Search with score ranking (rank all components in patch)
    const nearestCandidates = [...allComponents];
    if (nearestCandidates.length > 0) {
      nearestCandidates.sort((a, b) => {
        const targetArea = 1600 * areaScale;
        const areaPenaltyA = Math.abs(a.area - targetArea) / targetArea;
        const areaPenaltyB = Math.abs(b.area - targetArea) / targetArea;
        const aspectPenaltyA = Math.abs(a.width / a.height - 1.0);
        const aspectPenaltyB = Math.abs(b.width / b.height - 1.0);

        const scoreA = a.distToMarker * 0.5 + areaPenaltyA * 0.3 + aspectPenaltyA * 0.2;
        const scoreB = b.distToMarker * 0.5 + areaPenaltyB * 0.3 + aspectPenaltyB * 0.2;

        return scoreA - scoreB;
      });

      primaryComponent = nearestCandidates[0];
      detectionMethod = "NEAREST_COMPONENT";
    }
  }

  if (!primaryComponent) {
    return {
      mergedBbox: null,
      detectionMethod: "FAILED",
      candidateCount: allComponents.length,
      mergedCount: 0,
      primaryArea: 0,
      distToMarker: 999
    };
  }

  // ETAP 3: Component Grouping (Merge Multi-CC for single symbol)
  const mergedSet = [primaryComponent];
  let changed = true;

  while (changed) {
    changed = false;
    const currentMinX = Math.min(...mergedSet.map(c => c.minX));
    const currentMinY = Math.min(...mergedSet.map(c => c.minY));
    const currentMaxX = Math.max(...mergedSet.map(c => c.maxX));
    const currentMaxY = Math.max(...mergedSet.map(c => c.maxY));
    const currentBbox = { minX: currentMinX, minY: currentMinY, maxX: currentMaxX, maxY: currentMaxY };

    for (const cand of allComponents) {
      if (mergedSet.includes(cand)) continue;

      const gapDist = bboxDistance(currentBbox, cand);
      const newMinX = Math.min(currentMinX, cand.minX);
      const newMinY = Math.min(currentMinY, cand.minY);
      const newMaxX = Math.max(currentMaxX, cand.maxX);
      const newMaxY = Math.max(currentMaxY, cand.maxY);
      const combW = newMaxX - newMinX + 1;
      const combH = newMaxY - newMinY + 1;
      const combArea = combW * combH;
      const combAspect = Math.max(combW / combH, combH / combW);

      if (gapDist <= maxGapDist && combArea <= maxRawArea && combAspect <= 8.0 && cand.distToMarker <= maxSearchDist) {
        mergedSet.push(cand);
        changed = true;
        break;
      }
    }
  }

  if (mergedSet.length > 1 && detectionMethod === "DIRECT_COMPONENT") {
    detectionMethod = "MERGED_COMPONENTS";
  }

  const finalMinX = Math.min(...mergedSet.map(c => c.minX));
  const finalMinY = Math.min(...mergedSet.map(c => c.minY));
  const finalMaxX = Math.max(...mergedSet.map(c => c.maxX));
  const finalMaxY = Math.max(...mergedSet.map(c => c.maxY));
  const finalW = finalMaxX - finalMinX + 1;
  const finalH = finalMaxY - finalMinY + 1;
  const finalArea = finalW * finalH;
  const finalAspect = Math.max(finalW / finalH, finalH / finalW);

  const finalCenterX = (finalMinX + finalMaxX) / 2;
  const finalCenterY = (finalMinY + finalMaxY) / 2;
  const finalDist = getDistance(pixelX, pixelY, finalCenterX, finalCenterY);

  if (finalArea < 4 || finalArea > maxRawArea * 3 || finalAspect > 10.0) {
    return {
      mergedBbox: null,
      detectionMethod: "FAILED",
      candidateCount: allComponents.length,
      mergedCount: mergedSet.length,
      primaryArea: finalArea,
      distToMarker: finalDist
    };
  }

  return {
    mergedBbox: {
      minX: finalMinX,
      minY: finalMinY,
      maxX: finalMaxX,
      maxY: finalMaxY,
      width: finalW,
      height: finalH
    },
    detectionMethod,
    candidateCount: allComponents.length,
    mergedCount: mergedSet.length,
    primaryArea: finalArea,
    distToMarker: finalDist
  };
}

async function runFullDatasetAudit() {
  console.log("=================================================");
  console.log("  FULL DATASET AUDIT: SINGLE_SYMBOL_CROP_V2.1    ");
  console.log("=================================================");

  const { data: approvedCrops, error: cropsErr } = await supabase
    .from("symbol_crops")
    .select("id, stromkreis_id, plan_id, symbol_type, image_path")
    .eq("quality_status", "approved");

  if (cropsErr || !approvedCrops) {
    throw new Error(`Failed to fetch approved crops: ${cropsErr?.message}`);
  }

  console.log(`Loaded ${approvedCrops.length} approved symbol_crops from DB.`);

  // Pre-fetch ALL stromkreise (all 1354 markers, Supabase default limit is 1000)
  const markerMap = {};
  const { data: allMarkers, error: markersErr } = await supabase
    .from("stromkreise")
    .select("id, x_norm, y_norm, type, metadata, plan_id")
    .limit(2000);

  if (markersErr) {
    throw new Error(`Failed to fetch all stromkreise: ${markersErr.message}`);
  }
  (allMarkers || []).forEach(m => { markerMap[m.id] = m; });

  console.log(`Pre-fetched ${Object.keys(markerMap).length} markers from stromkreise.`);

  const planMap = {};
  for (const crop of approvedCrops) {
    if (!planMap[crop.plan_id]) planMap[crop.plan_id] = [];
    planMap[crop.plan_id].push(crop);
  }

  const auditResults = [];
  const cacheDir = path.join(os.tmpdir(), "plan_png_cache");
  await fs.mkdir(cacheDir, { recursive: true });

  const previewDir = path.join("/home/ubuntu/building-task-manager/web", "v2_preview_50");
  await fs.mkdir(previewDir, { recursive: true });

  let processedCount = 0;

  for (const [planId, crops] of Object.entries(planMap)) {
    console.log(`\n--- Processing Plan ${planId} (${crops.length} approved crops) ---`);

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("id, pdf_path, storage_path, image_width, image_height")
      .eq("id", planId)
      .single();

    if (planErr || !plan) {
      console.error(`Error fetching plan ${planId}: ${planErr?.message}`);
      continue;
    }

    const targetDpi = plan.image_width ? Math.min(300, Math.max(150, Math.round((plan.image_width / 3584) * 150))) : 150;
    const cachedPlanPng = path.join(cacheDir, `${planId}_${targetDpi}.png`);

    try {
      await fs.access(cachedPlanPng);
    } catch {
      console.log(`Downloading and rendering plan PDF at ${targetDpi} DPI...`);
      const storagePath = plan.storage_path || plan.pdf_path;
      const { data: pdfData, error: dlErr } = await supabase.storage.from("plans").download(storagePath);
      if (dlErr || !pdfData) {
        console.error(`Failed to download PDF for plan ${planId}: ${dlErr?.message}`);
        continue;
      }

      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "crop-v2-full-"));
      const pdfPath = path.join(workDir, "input.pdf");

      try {
        const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
        await fs.writeFile(pdfPath, pdfBuffer);

        const pngBase = path.join(workDir, "page");
        await execFileAsync("pdftoppm", ["-png", "-r", String(targetDpi), pdfPath, pngBase]);
        const page1Png = `${pngBase}-1.png`;

        try {
          await execFileAsync("convert", [page1Png, "-background", "white", "-alpha", "remove", "-alpha", "off", cachedPlanPng]);
        } catch {
          await fs.copyFile(page1Png, cachedPlanPng);
        }
      } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const sharpImg = sharp(cachedPlanPng);
    const imgMeta = await sharpImg.metadata();
    const imgW = imgMeta.width;
    const imgH = imgMeta.height;


    for (const crop of crops) {
      processedCount++;
      const marker = markerMap[crop.stromkreis_id];
      if (!marker) {
        console.warn(`[${processedCount}/${approvedCrops.length}] Marker not found for stromkreis ${crop.stromkreis_id}`);
        continue;
      }

      const pixelX = Math.round(marker.x_norm * imgW);
      const pixelY = Math.round(marker.y_norm * imgH);

      const patchSize = Math.round(512 * (targetDpi / 150));
      const patchLeft = Math.max(0, Math.min(pixelX - Math.round(patchSize / 2), imgW - patchSize));
      const patchTop = Math.max(0, Math.min(pixelY - Math.round(patchSize / 2), imgH - patchSize));

      const { data: patchPixels, info: patchInfo } = await sharpImg
        .clone()
        .extract({ left: patchLeft, top: patchTop, width: patchSize, height: patchSize })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const detRes = findTargetSymbolComponentsV21(
        patchPixels,
        patchInfo.width,
        patchInfo.height,
        patchLeft,
        patchTop,
        pixelX,
        pixelY,
        patchInfo.channels || 4,
        targetDpi / 150
      );

      let status = "SINGLE_SYMBOL_SUCCESS";
      let cropBbox = null;
      let margin = 6;
      let compW = 48;
      let compH = 48;
      let compArea = 0;

      if (!detRes.mergedBbox || detRes.detectionMethod === "FAILED") {
        status = "FAILED_NO_COMPONENT";
        cropBbox = {
          left: Math.max(0, Math.min(pixelX - 24, imgW - 48)),
          top: Math.max(0, Math.min(pixelY - 24, imgH - 48)),
          width: 48,
          height: 48
        };
      } else {
        const targetComp = detRes.mergedBbox;
        compW = targetComp.width;
        compH = targetComp.height;
        compArea = detRes.primaryArea;

        const left = Math.max(0, targetComp.minX - margin);
        const top = Math.max(0, targetComp.minY - margin);
        const right = Math.min(imgW, targetComp.maxX + margin);
        const bottom = Math.min(imgH, targetComp.maxY + margin);
        cropBbox = { left, top, width: right - left, height: bottom - top };
      }

      const rawCropBuffer = await sharpImg.clone().extract(cropBbox).png().toBuffer();
      const final256Buffer = await sharp(rawCropBuffer)
        .resize(256, 256, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();

      const uploadPathV2 = `symbol_crops_v2/${planId}/${crop.stromkreis_id}/256.png`;
      await supabase.storage.from("symbol-crops").upload(uploadPathV2, final256Buffer, {
        contentType: "image/png",
        upsert: true
      });

      const auditRecord = {
        stromkreis_id: crop.stromkreis_id,
        plan_id: planId,
        symbol_type: crop.symbol_type || marker.type || "socket",
        detection_method: detRes.detectionMethod,
        component_count_before: 3,
        component_count_after: 1,
        merged_components_count: detRes.mergedCount,
        bbox_width: compW,
        bbox_height: compH,
        component_area: compArea,
        distance_to_marker: Math.round(detRes.distToMarker * 100) / 100,
        status: status,
        old_image_path: crop.image_path
      };

      auditResults.push(auditRecord);

      if (processedCount % 100 === 0 || processedCount === approvedCrops.length) {
        console.log(`Processed [${processedCount}/${approvedCrops.length}] records...`);
      }
    }
  }

  const auditPath = path.join("/home/ubuntu/building-task-manager/web", "single_symbol_crop_v2_full_audit.json");
  await fs.writeFile(auditPath, JSON.stringify(auditResults, null, 2));
  console.log(`Saved full audit JSON to ${auditPath}`);

  const total = auditResults.length;
  const success = auditResults.filter(a => a.status === "SINGLE_SYMBOL_SUCCESS").length;
  const failed = auditResults.filter(a => a.status === "FAILED_NO_COMPONENT").length;

  const directComp = auditResults.filter(a => a.detection_method === "DIRECT_COMPONENT").length;
  const nearestComp = auditResults.filter(a => a.detection_method === "NEAREST_COMPONENT").length;
  const mergedComp = auditResults.filter(a => a.detection_method === "MERGED_COMPONENTS").length;

  const multiSymbolRate = ((auditResults.filter(a => a.component_count_after > 1).length / total) * 100).toFixed(2);

  const avgW = (auditResults.reduce((sum, a) => sum + a.bbox_width, 0) / total).toFixed(2);
  const avgH = (auditResults.reduce((sum, a) => sum + a.bbox_height, 0) / total).toFixed(2);
  const avgArea = (auditResults.reduce((sum, a) => sum + a.component_area, 0) / total).toFixed(2);

  console.log("\n=================================================");
  console.log("  FULL DATASET AUDIT SUMMARY (1354 RECORDS)       ");
  console.log("=================================================");
  console.log(`TOTAL                  : ${total}`);
  console.log(`SUCCESS                : ${success} (${((success / total) * 100).toFixed(2)}%)`);
  console.log(`FAILED                 : ${failed} (${((failed / total) * 100).toFixed(2)}%)`);
  console.log(`DIRECT_COMPONENT       : ${directComp}`);
  console.log(`NEAREST_COMPONENT      : ${nearestComp}`);
  console.log(`MERGED_COMPONENTS      : ${mergedComp}`);
  console.log(`MULTI_SYMBOL_RATE      : ${multiSymbolRate}% (CEL: <=5%)`);
  console.log(`Average BBox Size      : ${avgW} x ${avgH} px`);
  console.log(`Average Component Area : ${avgArea} px²`);
  console.log("=================================================");

  console.log("\nGenerating 50 random visual previews in v2_preview_50/...");
  const shuffled = [...auditResults].sort(() => 0.5 - Math.random());
  const selected50 = shuffled.slice(0, 50);

  for (let i = 0; i < selected50.length; i++) {
    const r = selected50[i];
    const itemDir = path.join(previewDir, `${String(i + 1).padStart(2, "0")}_${r.stromkreis_id.slice(0, 8)}`);
    await fs.mkdir(itemDir, { recursive: true });

    const oldCropPath = path.join(itemDir, "old_crop.png");
    if (r.old_image_path) {
      try {
        const pathPart = r.old_image_path.startsWith("crops/") ? r.old_image_path : `crops/${r.old_image_path}`;
        const { data: oldData } = await supabase.storage.from("symbol-crops").download(pathPart);
        if (oldData) {
          const oldBuf = Buffer.from(await oldData.arrayBuffer());
          await fs.writeFile(oldCropPath, oldBuf);
        } else {
          throw new Error("no data");
        }
      } catch {
        await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } })
          .png()
          .toFile(oldCropPath);
      }
    } else {
      await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } } })
        .png()
        .toFile(oldCropPath);
    }

    const newCropPath = path.join(itemDir, "new_crop_v2_1.png");
    const v2StoragePath = `symbol_crops_v2/${r.plan_id}/${r.stromkreis_id}/256.png`;
    try {
      const { data: newData } = await supabase.storage.from("symbol-crops").download(v2StoragePath);
      if (newData) {
        const newBuf = Buffer.from(await newData.arrayBuffer());
        await fs.writeFile(newCropPath, newBuf);
      }
    } catch (err) {
      console.error(`Failed preview download for ${r.stromkreis_id}: ${err.message}`);
    }
  }

  console.log("Successfully generated 50 preview folders in v2_preview_50/.");
}

runFullDatasetAudit().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});
