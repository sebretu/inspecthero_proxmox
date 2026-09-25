import path from "path";
import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateImageEmbedding } from "./embeddingService";

const execFileAsync = promisify(execFile);
const DPI = 150;

export interface SymbolCropV2Result {
  stromkreis_id: string;
  plan_id: string;
  symbol_type: string;
  old_crop_size: number;
  detection_method: "DIRECT_COMPONENT" | "NEAREST_COMPONENT" | "MERGED_COMPONENTS" | "FAILED";
  candidate_count: number;
  merged_components_count: number;
  component_found: boolean;
  component_bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
  crop_bbox: { left: number; top: number; width: number; height: number } | null;
  margin: number;
  component_area: number;
  bbox_width: number;
  bbox_height: number;
  distance_to_marker: number;
  old_component_count: number;
  new_component_count: number;
  status: "SINGLE_SYMBOL_SUCCESS" | "FAILED_NO_COMPONENT" | "FAILED_AMBIGUOUS_COMPONENT";
  image_path_v2: string;
  embedding_generated: boolean;
  embedding_vector?: number[] | null;
}

export interface RawComponent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  pixelCount: number;
  centerX: number;
  centerY: number;
  distToMarker: number;
  coversMarker: boolean;
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function bboxDistance(b1: { minX: number; minY: number; maxX: number; maxY: number }, b2: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const dx = Math.max(0, b1.minX - b2.maxX, b2.minX - b1.maxX);
  const dy = Math.max(0, b1.minY - b2.maxY, b2.minY - b1.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}

// 2D Multi-Stage Connected Components Analysis & Merging V2.1
export function findTargetSymbolComponentsV21(
  rawPixels: Buffer,
  patchW: number,
  patchH: number,
  patchLeft: number,
  patchTop: number,
  pixelX: number,
  pixelY: number,
  channels: number = 4,
  dpiScale: number = 1.0
): {
  mergedBbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
  detectionMethod: "DIRECT_COMPONENT" | "NEAREST_COMPONENT" | "MERGED_COMPONENTS" | "FAILED";
  candidateCount: number;
  mergedCount: number;
  primaryArea: number;
  distToMarker: number;
} {
  const visited = new Uint8Array(patchW * patchH);
  const allComponents: RawComponent[] = [];

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

      // Dark non-background pixel check (lum < 248 or colored conductor line)
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

      // BFS Flood Fill
      const queue: number[] = [x, y];
      visited[idx] = 1;

      let minX = x, maxX = x, minY = y, maxY = y;
      let pixelCount = 0;
      let coversMarker = false;

      while (queue.length > 0) {
        const cx = queue.shift()!;
        const cy = queue.shift()!;
        pixelCount++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (Math.abs(cx - markerPatchX) <= Math.round(8 * (dpiScale || 1.0)) && Math.abs(cy - markerPatchY) <= Math.round(8 * (dpiScale || 1.0))) {
          coversMarker = true;
        }

        // 8-neighborhood
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

      // Raw component filtering (area >= 4px², dist <= maxSearchDist)
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
  let primaryComponent: RawComponent | null = null;
  let detectionMethod: "DIRECT_COMPONENT" | "NEAREST_COMPONENT" | "MERGED_COMPONENTS" | "FAILED" = "FAILED";

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
  const mergedSet: RawComponent[] = [primaryComponent];
  let changed = true;

  while (changed) {
    changed = false;
    // Current bounding box of merged set
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

  // Final Merged Bounding Box
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

  // FINAL VALIDATION
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
    distToMarker: Number(finalDist.toFixed(2))
  };
}

export async function generateSymbolCropV21(
  stromkreisId: string,
  options?: { saveToStorage?: boolean; previewMode?: boolean }
): Promise<SymbolCropV2Result> {
  const supabase = getSupabaseAdminClient();
  const saveToStorage = options?.saveToStorage ?? true;

  // 1. Fetch marker record from stromkreise (UNTOUCHABLE GT)
  const { data: marker, error: markerErr } = await supabase
    .from("stromkreise")
    .select("*")
    .eq("id", stromkreisId)
    .single();

  if (markerErr || !marker) {
    throw new Error(`[symbolCropperV2] Error fetching marker ${stromkreisId}: ${markerErr?.message}`);
  }

  if (!marker.plan_id || marker.x_norm === null || marker.y_norm === null || marker.x_norm === undefined) {
    throw new Error(`[symbolCropperV2] Marker ${stromkreisId} missing coordinates or plan_id.`);
  }

  // Fetch plan
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("storage_path, image_width, image_height")
    .eq("id", marker.plan_id)
    .single();

  if (planErr || !plan || !plan.storage_path) {
    throw new Error(`[symbolCropperV2] Plan not found for ${marker.plan_id}`);
  }

  // Fetch tile metadata
  const searchDirs = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let meta: any = null;
  for (const dir of searchDirs) {
    const p = path.join(dir, marker.plan_id, "meta.json");
    try {
      const raw = await fs.readFile(p, "utf-8");
      meta = JSON.parse(raw);
      break;
    } catch {}
  }

  let gridW = meta?.gridW || Math.ceil((plan.image_width || 3584) / 256);
  let gridH = meta?.gridH || Math.ceil((plan.image_height || 2560) / 256);

  const targetDpi = plan.image_width ? Math.min(300, Math.max(150, Math.round((plan.image_width / 3584) * 150))) : 150;

  // Plan PNG caching
  const cacheDir = path.join(os.tmpdir(), "plan_png_cache");
  await fs.mkdir(cacheDir, { recursive: true });
  const cachedPlanPng = path.join(cacheDir, `${marker.plan_id}_${targetDpi}.png`);

  let flattenedPng = cachedPlanPng;

  try {
    await fs.access(cachedPlanPng);
  } catch {
    const { data: pdfData, error: dlErr } = await supabase.storage.from("plans").download(plan.storage_path);
    if (dlErr || !pdfData) {
      throw new Error(`[symbolCropperV2] Failed to download PDF: ${dlErr?.message}`);
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "crop-v2-"));
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

  const sharpImg = sharp(flattenedPng);
  const imgMeta = await sharpImg.metadata();
  const imgW = imgMeta.width || gridW * 256;
  const imgH = imgMeta.height || gridH * 256;

  const pixelX = Math.round(marker.x_norm * imgW);
  const pixelY = Math.round(marker.y_norm * imgH);

  // Extract search patch (512px at 150 DPI, scaled by targetDpi / 150) around marker
  const patchSize = Math.round(512 * (targetDpi / 150));
  const patchLeft = Math.max(0, Math.min(pixelX - Math.round(patchSize / 2), imgW - patchSize));
  const patchTop = Math.max(0, Math.min(pixelY - Math.round(patchSize / 2), imgH - patchSize));

  const { data: patchPixels, info: patchInfo } = await sharpImg
    .clone()
    .extract({ left: patchLeft, top: patchTop, width: patchSize, height: patchSize })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Execute Multi-Stage Detection & Merging V2.1
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

  let status: "SINGLE_SYMBOL_SUCCESS" | "FAILED_NO_COMPONENT" | "FAILED_AMBIGUOUS_COMPONENT" = "SINGLE_SYMBOL_SUCCESS";
  let compBbox = null;
  let cropBbox = null;
  let margin = 6;
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
    compBbox = {
      minX: targetComp.minX,
      minY: targetComp.minY,
      maxX: targetComp.maxX,
      maxY: targetComp.maxY,
      width: targetComp.width,
      height: targetComp.height
    };
    compArea = detRes.primaryArea;

    const left = Math.max(0, targetComp.minX - margin);
    const top = Math.max(0, targetComp.minY - margin);
    const right = Math.min(imgW, targetComp.maxX + margin);
    const bottom = Math.min(imgH, targetComp.maxY + margin);
    const w = right - left;
    const h = bottom - top;

    cropBbox = { left, top, width: w, height: h };
  }

  const workDirCrop = await fs.mkdtemp(path.join(os.tmpdir(), "crop-v21-"));
  try {
    const rawCropBuffer = await sharpImg.clone().extract(cropBbox).png().toBuffer();
    const final256Buffer = await sharp(rawCropBuffer)
      .resize(256, 256, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();

    const uploadPathV2 = `symbol_crops_v2/${marker.plan_id}/${stromkreisId}/256.png`;

    if (saveToStorage) {
      await supabase.storage.from("symbol-crops").upload(uploadPathV2, final256Buffer, {
        contentType: "image/png",
        upsert: true,
      });
    }

    const local256Path = path.join(workDirCrop, "crop_v21_256.png");
    await fs.writeFile(local256Path, final256Buffer);

    let embeddingVector: number[] | null = null;
    try {
      embeddingVector = await generateImageEmbedding(local256Path);
    } catch (embErr: any) {
      console.error(`[symbolCropperV2] Embedding generation error: ${embErr.message}`);
    }

    return {
      stromkreis_id: stromkreisId,
      plan_id: marker.plan_id,
      symbol_type: marker.metadata?.realType || marker.type || "socket",
      old_crop_size: 256,
      detection_method: detRes.detectionMethod,
      candidate_count: detRes.candidateCount,
      merged_components_count: detRes.mergedCount,
      component_found: detRes.mergedBbox !== null,
      component_bbox: compBbox,
      crop_bbox: cropBbox,
      margin: 6,
      component_area: compArea,
      bbox_width: compBbox ? compBbox.width : 48,
      bbox_height: compBbox ? compBbox.height : 48,
      distance_to_marker: detRes.distToMarker,
      old_component_count: 3,
      new_component_count: 1,
      status,
      image_path_v2: uploadPathV2,
      embedding_generated: embeddingVector !== null,
      embedding_vector: embeddingVector
    };
  } finally {
    await fs.rm(workDirCrop, { recursive: true, force: true }).catch(() => {});
  }
}

export const generateSymbolCropV2 = generateSymbolCropV21;
