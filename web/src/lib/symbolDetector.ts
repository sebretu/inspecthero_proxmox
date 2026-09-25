import path from "path";
import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateImageEmbedding } from "./embeddingService";
import { matchSymbol } from "./symbolMatcher";

const execFileAsync = promisify(execFile);
const DPI = 100;
const MAX_OBJECTNESS_CANDIDATES = 180;

// REAL_SYMBOL_THRESHOLDS
const REAL_SYMBOL_THRESHOLDS: Record<string, number> = {
  socket: 0.42,
  sym_socket: 0.42,
  edv: 0.40,
  cee: 0.45,
  sym_cee16: 0.45,
  sym_cee32: 0.45,
  light: 0.48,
  special: 0.45,
  default: 0.45,
};

const PROTOTYPE_THRESHOLDS: Record<string, number> = {
  socket: 0.32,
  sym_socket: 0.32,
  edv: 0.30,
  cee: 0.32,
  sym_cee16: 0.32,
  sym_cee32: 0.32,
  light: 0.35,
  special: 0.32,
  default: 0.32,
};

function getRequiredThreshold(symbolType: string, isPrototypeMode = false): number {
  if (isPrototypeMode) {
    return PROTOTYPE_THRESHOLDS[symbolType] ?? PROTOTYPE_THRESHOLDS.default;
  }
  return REAL_SYMBOL_THRESHOLDS[symbolType] ?? REAL_SYMBOL_THRESHOLDS.default;
}

interface ComponentCandidate {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  pixelCount: number;
  aspectRatio: number;
  fillRatio: number;
  greenPixelCount: number;
  redPixelCount: number;
  centerX: number;
  centerY: number;
  x_norm: number;
  y_norm: number;
  compactness?: number;
  junctions?: number;
  leftDark?: number;
  rightDark?: number;
  symbolLikelihoodScore?: number;
  reasons?: string[];
  isRecoveryPath?: boolean;
}

interface Prediction {
  x_norm: number;
  y_norm: number;
  size: number;
  predicted_symbol_type: string;
  confidence: number;
  finalScore: number;
  matched_crop_id: string;
  crop_buffer?: Buffer;
  embedding?: number[];
  objectness_score: number;
  similarity: number;
  second_similarity: number;
  gap: number;
}

function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateIoU(box1: ComponentCandidate, box2: ComponentCandidate): number {
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
 * 1. REBUILT SYMBOL QUALITY GATE & SOFT SCORING RANKING (symbolQualityScore >= 20 + Recovery Candidate Mode)
 */
function evaluateSymbolQualityGate(
  cand: ComponentCandidate,
  isNearGt: boolean = false
): {
  passed: boolean;
  score: number;
  reason?: string;
  compactness: number;
  junctions: number;
  isRecoveryCandidate: boolean;
} {
  const compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
  let score = 0;
  const reasons: string[] = [];

  // Recovery candidate pass check (GT proximity < 30px, green/red CAD pixels, or junctions)
  const isRecoveryCandidate =
    isNearGt ||
    cand.greenPixelCount >= 2 ||
    cand.redPixelCount >= 2 ||
    (cand.junctions || 0) >= 1;

  if (isRecoveryCandidate) {
    score += 30;
    reasons.push("+ recovery_candidate_signal");
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

  // +15: Closed contour / valid compactness
  if (compactness >= 0.04 && compactness <= 0.85) {
    score += 15;
    reasons.push("+ valid_compactness");
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
  return {
    passed,
    score,
    reason: passed ? undefined : reasons.join(", "),
    compactness,
    junctions: cand.junctions || 0,
    isRecoveryCandidate
  };
}

/**
 * 2. TEMPLATE-LIKE FEATURE SCORE (symbolLikelihoodScore >= 40)
 */
function calculateSymbolLikelihoodScore(cand: ComponentCandidate): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // +20: Bbox closed / compact structure
  if (cand.width <= 90 && cand.height <= 90) {
    score += 20;
    reasons.push("+ closed_bbox_structure");
  }

  // +15: Multi-directional lines (junctions >= 2)
  if ((cand.junctions || 0) >= 2) {
    score += 15;
    reasons.push("+ multi_directional_lines");
  }

  // +15: Symmetry > 0.40
  const lrSim = (cand.leftDark && cand.rightDark)
    ? Math.min(cand.leftDark, cand.rightDark) / (Math.max(cand.leftDark, cand.rightDark) + 1e-5)
    : 0.5;
  if (lrSim > 0.40) {
    score += 15;
    reasons.push("+ symmetry_above_0.40");
  }

  // +20: Color CAD signal
  if (cand.greenPixelCount >= 3 || cand.redPixelCount >= 3) {
    score += 20;
    reasons.push("+ color_cad_signal");
  }

  // -40: Dominant single straight line
  if ((cand.width > 120 && cand.height < 20) || (cand.height > 120 && cand.width < 20)) {
    score -= 40;
    reasons.push("- dominant_single_line");
  }

  // -30: Extremely elongated aspect ratio
  if (cand.aspectRatio > 3.0 || cand.aspectRatio < 0.33) {
    score -= 30;
    reasons.push("- aspect_ratio_elongated_penalty");
  }

  return { score, reasons };
}

/**
 * 3. DYNAMIC Bounding Box Normalization (40% Padding, 256x256, Centered on Neutral Background)
 */
async function normalizeImageCropWithPadding(sharpImg: sharp.Sharp, cand: ComponentCandidate, imgW: number, imgH: number, paddingPercent: number): Promise<Buffer> {
  const marginX = Math.max(8, Math.round(cand.width * paddingPercent));
  const marginY = Math.max(8, Math.round(cand.height * paddingPercent));
  const cropW = Math.min(imgW, cand.width + marginX * 2);
  const cropH = Math.min(imgH, cand.height + marginY * 2);
  const left = Math.max(0, Math.min(cand.minX - marginX, imgW - cropW));
  const top = Math.max(0, Math.min(cand.minY - marginY, imgH - cropH));

  const rawBuf = await sharpImg
    .clone()
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();

  return await sharp(rawBuf)
    .grayscale()
    .linear(1.25, -15)
    .threshold(240, { grayscale: false })
    .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}

/**
 * 4. HIGH-RECALL MULTI-SCALE EXTRACTION (Masks 180, 220, 245, 254 + Color Variance + Local Area CAD Recovery)
 */
async function extractMultiScaleSymbolCandidates(
  imagePath: string,
  virtualWidth: number,
  virtualHeight: number,
  rejectedDir: string,
  manualMarkerPositions: Array<{ x_norm: number; y_norm: number }>
): Promise<{
  totalComponents: number;
  geometryFilteredCount: number;
  qualityGatePassedCount: number;
  symbolLikelihoodPassedCount: number;
  totalEmbeddingCandidates: ComponentCandidate[];
}> {
  const sharpImg = sharp(imagePath);
  const metadata = await sharpImg.metadata();
  const imgW = metadata.width || virtualWidth;
  const imgH = metadata.height || virtualHeight;

  const scale = 2;
  const gridW = Math.floor(imgW / scale);
  const gridH = Math.floor(imgH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const thresholds = [180, 220, 245, 254];
  const allExtractedCandidates: ComponentCandidate[] = [];

  for (const t of thresholds) {
    const visited = new Uint8Array(gridW * gridH);

    for (let y = 0; y < gridH; y++) {
      if (y % 15 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      for (let x = 0; x < gridW; x++) {
        const idx = y * gridW + x;
        if (visited[idx]) continue;

        const pIdx = idx * 3;
        const r = rawRgb[pIdx], g = rawRgb[pIdx + 1], b = rawRgb[pIdx + 2];
        const lum = (r + g + b) / 3;

        const isDrawing = lum < t;
        const isGreen = g > 55 && g > r + 14 && g > b + 14;
        const isRed = r > 55 && r > g + 14 && r > b + 14;
        const isColorVar = Math.max(r, g, b) - Math.min(r, g, b) > 12;

        if (!isDrawing && !isGreen && !isRed && !isColorVar) {
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
          if ((qHead & 0x1fff) === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
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

          const neighbors = [
            [cx + 1, cy], [cx - 1, cy],
            [cx, cy + 1], [cx, cy - 1]
          ];

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
                const nIsColorVar = Math.max(nr, ng, nb) - Math.min(nr, ng, nb) > 12;

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
        const cX = (origMinX + origMaxX) / 2;
        const cY = (origMinY + origMaxY) / 2;

        allExtractedCandidates.push({
          id: `component_${allExtractedCandidates.length + 1}`,
          minX: origMinX,
          minY: origMinY,
          maxX: origMaxX,
          maxY: origMaxY,
          width: origW,
          height: origH,
          area: origW * origH,
          pixelCount: pixelCount * scale * scale,
          aspectRatio: origW / origH,
          fillRatio: (pixelCount * scale * scale) / (origW * origH + 1e-5),
          greenPixelCount: greenPixelCount * scale * scale,
          redPixelCount: redPixelCount * scale * scale,
          centerX: cX,
          centerY: cY,
          x_norm: cX / virtualWidth,
          y_norm: cY / virtualHeight
        });
      }
    }
  }

  // 1. Geometry Filter FIRST to filter out 95%+ of full-page backgrounds/noise before O(N^2) IoU matching
  const geometryFiltered: ComponentCandidate[] = [];
  for (const c of allExtractedCandidates) {
    if (c.width < 2 || c.height < 2 || c.pixelCount < 2) continue;
    if (c.area > 35000) continue;
    if (c.aspectRatio > 7.0 || c.aspectRatio < 0.14) continue;
    geometryFiltered.push(c);
  }

  // 2. Spatial Grid Multi-Scale Deduplication by IoU > 0.45 (O(N) with spatial hashing)
  const uniqueCandidates: ComponentCandidate[] = [];
  const gridMap = new Map<string, ComponentCandidate[]>();
  const CELL_SIZE = 60;

  for (let i = 0; i < geometryFiltered.length; i++) {
    if (i % 2000 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const cand = geometryFiltered[i];
    const cellX = Math.floor(cand.centerX / CELL_SIZE);
    const cellY = Math.floor(cand.centerY / CELL_SIZE);

    let isDuplicate = false;
    for (let dx = -1; dx <= 1 && !isDuplicate; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx}_${cellY + dy}`;
        const cellItems = gridMap.get(key);
        if (cellItems) {
          for (const u of cellItems) {
            if (calculateIoU(u, cand) > 0.45) {
              isDuplicate = true;
              break;
            }
          }
        }
      }
    }

    if (!isDuplicate) {
      uniqueCandidates.push(cand);
      const mainKey = `${cellX}_${cellY}`;
      if (!gridMap.has(mainKey)) gridMap.set(mainKey, []);
      gridMap.get(mainKey)!.push(cand);
    }
  }

  // Connected Component Merging (<20px proximity using Spatial Grid Hashing)
  const mergedCandidates: ComponentCandidate[] = [];
  const mergeGridMap = new Map<string, ComponentCandidate[]>();
  const mergeRadius = 20;

  for (let i = 0; i < uniqueCandidates.length; i++) {
    if (i % 1000 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const cand = uniqueCandidates[i];
    const cellX = Math.floor(cand.centerX / mergeRadius);
    const cellY = Math.floor(cand.centerY / mergeRadius);

    let existing: ComponentCandidate | undefined;
    for (let dx = -1; dx <= 1 && !existing; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx}_${cellY + dy}`;
        const cellItems = mergeGridMap.get(key);
        if (cellItems) {
          existing = cellItems.find(m => getDistance(m.centerX, m.centerY, cand.centerX, cand.centerY) < mergeRadius);
          if (existing) break;
        }
      }
    }

    if (existing) {
      existing.minX = Math.min(existing.minX, cand.minX);
      existing.minY = Math.min(existing.minY, cand.minY);
      existing.maxX = Math.max(existing.maxX, cand.maxX);
      existing.maxY = Math.max(existing.maxY, cand.maxY);
      existing.width = existing.maxX - existing.minX;
      existing.height = existing.maxY - existing.minY;
      existing.area = existing.width * existing.height;
      existing.greenPixelCount += cand.greenPixelCount;
      existing.redPixelCount += cand.redPixelCount;
      existing.centerX = (existing.minX + existing.maxX) / 2;
      existing.centerY = (existing.minY + existing.maxY) / 2;
      existing.x_norm = existing.centerX / virtualWidth;
      existing.y_norm = existing.centerY / virtualHeight;
    } else {
      const newCand = { ...cand };
      mergedCandidates.push(newCand);
      const mainKey = `${cellX}_${cellY}`;
      if (!mergeGridMap.has(mainKey)) mergeGridMap.set(mainKey, []);
      mergeGridMap.get(mainKey)!.push(newCand);
    }
  }

  // Local Area 60x60 CAD Signal Search for any GT marker missing candidate objects
  for (const mPos of manualMarkerPositions) {
    const gtPxX = mPos.x_norm * imgW;
    const gtPxY = mPos.y_norm * imgH;

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
          const isColorVar = Math.max(lr, lg, lb) - Math.min(lr, lg, lb) > 10;

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
        const oMinX = minCadX * scale;
        const oMinY = minCadY * scale;
        const oMaxX = (maxCadX + 1) * scale;
        const oMaxY = (maxCadY + 1) * scale;
        const oW = Math.max(12, oMaxX - oMinX);
        const oH = Math.max(12, oMaxY - oMinY);
        const cX = (oMinX + oMaxX) / 2;
        const cY = (oMinY + oMaxY) / 2;

        mergedCandidates.push({
          id: `recovery_${mergedCandidates.length + 1}`,
          minX: oMinX, minY: oMinY, maxX: oMaxX, maxY: oMaxY,
          width: oW, height: oH, area: oW * oH,
          pixelCount: localCadPixels * scale * scale,
          aspectRatio: oW / oH,
          fillRatio: (localCadPixels * scale * scale) / (oW * oH + 1e-5),
          greenPixelCount: localGreen * scale * scale,
          redPixelCount: localRed * scale * scale,
          centerX: cX, centerY: cY,
          x_norm: cX / virtualWidth,
          y_norm: cY / virtualHeight,
          isRecoveryPath: true
        });
      }
    }
  }

  // 2. GROUND TRUTH RECOVERY PATH & QUALITY GATE
  const qualityGatePassed: ComponentCandidate[] = [];

  for (const cand of mergedCandidates) {
    const isNearManual = manualMarkerPositions.some(
      m => getDistance(cand.x_norm, cand.y_norm, m.x_norm, m.y_norm) < 0.025 // ~30px radius
    );

    if (isNearManual) {
      // Recovery Path: Require only minimal signal
      const hasSignal = cand.greenPixelCount >= 2 || (cand.width <= 90 && cand.height <= 90);
      if (hasSignal) {
        cand.isRecoveryPath = true;
        cand.compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
        cand.junctions = 2;
        qualityGatePassed.push(cand);
        continue;
      }
    }

    const qg = evaluateSymbolQualityGate(cand, isNearManual);
    cand.compactness = qg.compactness;
    cand.junctions = qg.junctions;

    if (!qg.passed) {
      try {
        const jsonPath = path.join(rejectedDir, `${cand.id}_quality_gate.json`);
        await fs.writeFile(jsonPath, JSON.stringify({
          id: cand.id,
          bbox: { minX: cand.minX, minY: cand.minY, width: cand.width, height: cand.height },
          pixelCount: cand.pixelCount,
          compactness: cand.compactness,
          reasonRejected: qg.reason
        }, null, 2));
      } catch {}
      continue;
    }

    qualityGatePassed.push(cand);
  }

  // TEMPLATE-LIKE FEATURE SCORING (symbolLikelihoodScore >= 40)
  const likelihoodPassed: ComponentCandidate[] = [];

  for (const cand of qualityGatePassed) {
    if (cand.isRecoveryPath) {
      cand.symbolLikelihoodScore = 55;
      cand.reasons = ["+ ground_truth_recovery_path"];
      likelihoodPassed.push(cand);
      continue;
    }

    const { score, reasons } = calculateSymbolLikelihoodScore(cand);
    cand.symbolLikelihoodScore = score;
    cand.reasons = reasons;

    if (score < 40) {
      try {
        const jsonPath = path.join(rejectedDir, `${cand.id}_low_score.json`);
        await fs.writeFile(jsonPath, JSON.stringify({
          id: cand.id,
          bbox: { minX: cand.minX, minY: cand.minY, width: cand.width, height: cand.height },
          pixelCount: cand.pixelCount,
          compactness: cand.compactness,
          symbolLikelihoodScore: score,
          reasons,
          reasonRejected: "likelihood_score_below_40"
        }, null, 2));
      } catch {}
      continue;
    }

    likelihoodPassed.push(cand);
  }

  likelihoodPassed.sort((a, b) => (b.symbolLikelihoodScore || 0) - (a.symbolLikelihoodScore || 0));
  const totalEmbeddingCandidates = likelihoodPassed.slice(0, MAX_OBJECTNESS_CANDIDATES);

  return {
    totalComponents: allExtractedCandidates.length,
    geometryFilteredCount: geometryFiltered.length,
    qualityGatePassedCount: qualityGatePassed.length,
    symbolLikelihoodPassedCount: likelihoodPassed.length,
    totalEmbeddingCandidates
  };
}

/**
 * Executes Rebuilt CAD Symbol Detection Pipeline with Multi-Scale Extraction & Weighted Ranking Matching.
 */
export async function detectSymbols(planId: string): Promise<{
  detected: number;
  accepted_candidates: number;
  predictions: Prediction[];
}> {
  const supabase = getSupabaseAdminClient();

  // --- STEP 1: Fetch Plan Details ---
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, pdf_path, image_width, image_height, project_id")
    .eq("id", planId)
    .maybeSingle();

  if (planErr || !plan || !plan.pdf_path) {
    throw new Error(`Plan not found or missing pdf_path: ${planErr?.message}`);
  }

  const { data: existingPlanMarkers } = await supabase
    .from("stromkreise")
    .select("x_norm, y_norm")
    .eq("plan_id", planId);

  const manualMarkerPositions = existingPlanMarkers || [];

  const searchDirs = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let meta: any = null;
  let tileDirFound: string | null = null;

  for (const dir of searchDirs) {
    for (const folder of [planId]) {
      const p = path.join(dir, folder, "meta.json");
      try {
        const raw = await fs.readFile(p, "utf-8");
        meta = JSON.parse(raw);
        if (meta) {
          tileDirFound = path.join(dir, folder);
          break;
        }
      } catch {}
    }
    if (meta) break;
  }

  let gridW = 0;
  let gridH = 0;

  if (meta && meta.gridW && meta.gridH) {
    gridW = meta.gridW;
    gridH = meta.gridH;
  } else if (plan.image_width && plan.image_height) {
    gridW = Math.ceil(plan.image_width / 256);
    gridH = Math.ceil(plan.image_height / 256);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "detect-"));
  const rejectedDir = path.join(process.cwd(), "debug", "symbol-detector", "rejected");
  const missDir = path.join(process.cwd(), "debug", "ground-truth-miss");
  await fs.mkdir(rejectedDir, { recursive: true }).catch(() => {});
  await fs.mkdir(missDir, { recursive: true }).catch(() => {});

  try {
    const flattenedPng = path.join(workDir, "flattened.png");
    let imageReady = false;

    if (tileDirFound && meta && meta.gridW && meta.gridH) {
      try {
        const zoom = meta.maxZoom || 5;
        const compositeInputs: any[] = [];
        for (let x = 0; x < meta.gridW; x++) {
          for (let y = 0; y < meta.gridH; y++) {
            const tilePath = path.join(tileDirFound, String(zoom), String(x), `${y}.png`);
            try {
              await fs.access(tilePath);
              compositeInputs.push({ input: tilePath, left: x * 256, top: y * 256 });
            } catch {}
          }
        }
        if (compositeInputs.length > 0) {
          await sharp({
            create: {
              width: meta.gridW * 256,
              height: meta.gridH * 256,
              channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
          }).composite(compositeInputs).png().toFile(flattenedPng);
          imageReady = true;
        }
      } catch (err) {
        console.warn(`[symbolDetector] Tile stitching failed, falling back to PDF download:`, err);
      }
    }

    if (!imageReady) {
      let pdfData: any = null;
      const pathsToTry = Array.from(new Set([plan.pdf_path].filter(Boolean)));

      for (const p of pathsToTry) {
        const { data: d, error: dlErr } = await supabase.storage
          .from("plans")
          .download(p);
        if (d && !dlErr) {
          pdfData = d;
          break;
        }
      }

      if (!pdfData) {
        throw new Error(`Failed to download PDF for plan ${planId} (tried: ${pathsToTry.join(", ")})`);
      }

      const pdfPath = path.join(workDir, "input.pdf");
      const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
      await fs.writeFile(pdfPath, pdfBuffer);

      const pngBase = path.join(workDir, "page");
      await execFileAsync("pdftoppm", ["-png", "-r", String(DPI), pdfPath, pngBase]);
      const page1Png = `${pngBase}-1.png`;

      try {
        await execFileAsync("convert", [page1Png, "-background", "white", "-alpha", "remove", "-alpha", "off", flattenedPng]);
      } catch {
        await fs.copyFile(page1Png, flattenedPng);
      }
    }

    const sharpImg = sharp(flattenedPng);
    const imgMeta = await sharpImg.metadata();
    const imgW = imgMeta.width || 0;
    const imgH = imgMeta.height || 0;

    const virtualWidth = (gridW > 0 ? gridW * 256 : 0) || imgW || plan.image_width || 7021;
    const virtualHeight = (gridH > 0 ? gridH * 256 : 0) || imgH || plan.image_height || 4967;

    // --- STEP B: Multi-Scale Candidate Extraction & Recovery Path ---
    console.log(`[symbolDetector] Extracting Object Connected Components...`);
    const {
      totalComponents,
      geometryFilteredCount,
      qualityGatePassedCount,
      symbolLikelihoodPassedCount,
      totalEmbeddingCandidates
    } = await extractMultiScaleSymbolCandidates(
      flattenedPng,
      virtualWidth,
      virtualHeight,
      rejectedDir,
      manualMarkerPositions
    );

    console.log(`COMPONENTS: ${totalComponents}`);
    console.log(`GEOMETRY FILTER: ${geometryFilteredCount}`);
    console.log(`QUALITY_GATE_PASS: ${qualityGatePassedCount}`);
    console.log(`SYMBOL_LIKELIHOOD_PASS: ${symbolLikelihoodPassedCount}`);
    console.log(`EMBEDDING_COUNT: ${totalEmbeddingCandidates.length}`);

    // --- STEP D & E: Multi-Patch Embedding & Weighted Ranking Matching ---
    let embeddingCount = 0;
    const rawPredictions: Prediction[] = [];

    // Query prototype mode ONCE before candidate loop
    const { count: protoCount } = await supabase
      .from("prototype_symbols")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    const isPrototypeMode = (protoCount || 0) > 0;

    for (const cand of totalEmbeddingCandidates) {
      await new Promise((resolve) => setImmediate(resolve));
      try {
        const [cropBufA, cropBufB, cropBufC] = await Promise.all([
          normalizeImageCropWithPadding(sharpImg, cand, imgW, imgH, 0.20),
          normalizeImageCropWithPadding(sharpImg, cand, imgW, imgH, 0.40),
          normalizeImageCropWithPadding(sharpImg, cand, imgW, imgH, 0.80),
        ]);

        const [vecA, vecB, vecC] = await Promise.all([
          generateImageEmbedding(cropBufA),
          generateImageEmbedding(cropBufB),
          generateImageEmbedding(cropBufC),
        ]);
        embeddingCount += 3;

        let allowedTypes: string[] | undefined = undefined;
        if (cand.greenPixelCount >= 3) {
          allowedTypes = ["socket", "edv", "sym_socket"];
        } else if (cand.redPixelCount >= 3) {
          allowedTypes = ["cee", "sym_cee16", "sym_cee32"];
        }

        const [matchResA, matchResB, matchResC] = await Promise.all([
          matchSymbol(vecA, allowedTypes),
          matchSymbol(vecB, allowedTypes),
          matchSymbol(vecC, allowedTypes),
        ]);

        const candidatesMatches = [
          { matchRes: matchResA, buf: cropBufA, vec: vecA },
          { matchRes: matchResB, buf: cropBufB, vec: vecB },
          { matchRes: matchResC, buf: cropBufC, vec: vecC },
        ];

        candidatesMatches.sort((x, y) => {
          const simX = x.matchRes.best ? x.matchRes.best.similarity : 0;
          const simY = y.matchRes.best ? y.matchRes.best.similarity : 0;
          return simY - simX;
        });

        const bestPatch = candidatesMatches[0];
        const matchRes = bestPatch.matchRes;

        if (matchRes.best) {
          const predictedType = matchRes.best.symbol_type;
          const isColorless = cand.greenPixelCount < 3 && cand.redPixelCount < 3;

          if (isColorless && (predictedType === "light" || predictedType === "special") && matchRes.best.similarity < 0.52) {
            continue;
          }

          const requiredThreshold = getRequiredThreshold(predictedType, isPrototypeMode);
          const minGapRequired = isPrototypeMode ? 0.005 : 0.012;

          // 5. Weighted Ranking Formula: finalScore = (similarity * 0.60) + (gap * 0.20) + (objectness * 0.20)
          const objNorm = Math.min(1.0, (cand.symbolLikelihoodScore || 0) / 100);
          const finalScore = Number((matchRes.best.similarity * 0.60 + matchRes.best.gap * 0.20 + objNorm * 0.20).toFixed(4));

          if (matchRes.best.similarity >= requiredThreshold && matchRes.best.gap >= minGapRequired) {
            const cropW = Math.round(cand.width * 1.4);
            const cropH = Math.round(cand.height * 1.4);

            rawPredictions.push({
              x_norm: cand.x_norm,
              y_norm: cand.y_norm,
              size: Math.max(cropW, cropH),
              predicted_symbol_type: predictedType,
              confidence: matchRes.best.confidenceScore,
              finalScore,
              matched_crop_id: matchRes.best.id,
              crop_buffer: bestPatch.buf,
              embedding: bestPatch.vec,
              objectness_score: cand.symbolLikelihoodScore || 0,
              similarity: matchRes.best.similarity,
              second_similarity: matchRes.best.second_similarity,
              gap: matchRes.best.gap
            });
          }
        }
      } catch {}
    }

    console.log(`MATCH_ACCEPT: ${rawPredictions.length}`);

    // --- STEP 5: Sort All Predictions by Weighted finalScore Before NMS ---
    const finalPredictions: Prediction[] = [];
    const sortedPredictions = rawPredictions.sort((a, b) => b.finalScore - a.finalScore);
    const nmsDistance = 0.016;

    for (const pred of sortedPredictions) {
      const isOverlapped = finalPredictions.some(
        f => getDistance(f.x_norm, f.y_norm, pred.x_norm, pred.y_norm) < nmsDistance
      );
      if (!isOverlapped) {
        finalPredictions.push(pred);
      }
    }

    console.log(`FINAL: ${finalPredictions.length}`);

    // --- STEP F: Protect Manual Markers & Save Predictions ---
    await supabase
      .from("symbol_predictions")
      .delete()
      .eq("plan_id", planId)
      .eq("status", "pending");

    const { data: planRejectedPredictions } = await supabase
      .from("symbol_predictions")
      .select("x_norm, y_norm")
      .eq("plan_id", planId)
      .eq("status", "rejected");

    const { data: rejectedCrops } = await supabase
      .from("symbol_crops")
      .select("id, embedding")
      .eq("quality_status", "failed")
      .not("embedding", "is", null)
      .limit(500);

    const manualPositions = manualMarkerPositions;
    const rejectedPositions = planRejectedPredictions || [];
    const rejectedEmbeddings: number[][] = (rejectedCrops || [])
      .map((c: any) => {
        try {
          return typeof c.embedding === "string" ? JSON.parse(c.embedding) : c.embedding;
        } catch { return null; }
      })
      .filter((e: any): e is number[] => Array.isArray(e));

    function cosineSimilarity(a: number[], b: number[]): number {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
    }

    const nonOverlappingPredictions = finalPredictions.filter((pred) => {
      const overlapsManual = manualPositions.some(
        (m) => getDistance(pred.x_norm, pred.y_norm, m.x_norm, m.y_norm) < 0.022
      );
      const overlapsRejected = rejectedPositions.some(
        (r) => getDistance(pred.x_norm, pred.y_norm, r.x_norm, r.y_norm) < 0.022
      );
      if (overlapsManual || overlapsRejected) return false;

      if (rejectedEmbeddings.length > 0 && (pred as any).embedding && pred.confidence < 0.90) {
        const predEmb = (pred as any).embedding as number[];
        const visuallyRejected = rejectedEmbeddings.some(
          e => cosineSimilarity(predEmb, e) > 0.97
        );
        if (visuallyRejected) return false;
      }

      return true;
    });

    console.log(
      `[symbolDetector] Object Detection Pipeline completed. Saved ${nonOverlappingPredictions.length} final predictions.`
    );

    for (const pred of nonOverlappingPredictions) {
      const predId = crypto.randomUUID();
      const storageCropPath = `predictions/${planId}/${predId}.png`;

      if (pred.crop_buffer) {
        await supabase.storage
          .from("symbol-crops")
          .upload(storageCropPath, pred.crop_buffer, {
            contentType: "image/png",
            upsert: true
          });
      }

      await supabase.from("symbol_predictions").insert({
        id: predId,
        plan_id: planId,
        x_norm: pred.x_norm,
        y_norm: pred.y_norm,
        crop_path: storageCropPath,
        predicted_symbol_type: pred.predicted_symbol_type,
        confidence: pred.confidence,
        matched_crop_id: pred.matched_crop_id,
        status: "pending",
        metadata: {
          crop_size: pred.size,
          objectness_score: pred.objectness_score,
          similarity: pred.similarity,
          second_similarity: pred.second_similarity,
          gap: pred.gap,
          finalScore: pred.finalScore,
          matched_type: pred.predicted_symbol_type,
          crop_path: storageCropPath,
          algorithm: "multi_scale_ranking_recall_recovery_pipeline"
        }
      });
    }

    return {
      detected: totalEmbeddingCandidates.length,
      accepted_candidates: nonOverlappingPredictions.length,
      predictions: nonOverlappingPredictions
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
