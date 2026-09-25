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
const EDGE_DENSITY_THRESHOLD = 0.005;

// Helper to crop, upload and return statistics
async function cropVariant(
  sharpImg: sharp.Sharp,
  params: {
    size: number;
    pixelX: number;
    pixelY: number;
    imgW: number;
    imgH: number;
    workDir: string;
    planId: string;
    stromkreisId: string;
    supabase: any;
  }
): Promise<string> {
  const { size, pixelX, pixelY, imgW, imgH, workDir, planId, stromkreisId, supabase } = params;

  const cropWidth = Math.min(size, imgW);
  const cropHeight = Math.min(size, imgH);

  let left = Math.round(pixelX - cropWidth / 2);
  let top = Math.round(pixelY - cropHeight / 2);

  // Boundary checks
  left = Math.max(0, Math.min(left, imgW - cropWidth));
  top = Math.max(0, Math.min(top, imgH - cropHeight));

  const croppedPath = path.join(workDir, `crop_${size}.png`);
  await sharpImg
    .clone()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toFile(croppedPath);

  // Upload to Supabase Storage: symbol-crops/crops/{plan_id}/{stromkreis_id}/{size}.png
  const uploadPath = `crops/${planId}/${stromkreisId}/${size}.png`;
  const cropBuffer = await fs.readFile(croppedPath);

  const { error: uploadErr } = await supabase.storage
    .from("symbol-crops")
    .upload(uploadPath, cropBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Storage upload failed for size ${size}: ${uploadErr.message}`);
  }

  return croppedPath;
}

export async function generateSymbolCrop(stromkreisId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // 1. Fetch the marker record
  const { data: marker, error: markerErr } = await supabase
    .from("stromkreise")
    .select("*")
    .eq("id", stromkreisId)
    .single();

  if (markerErr || !marker) {
    console.error(`[symbolCropper] Error fetching marker ${stromkreisId}:`, markerErr);
    return;
  }

  // Validate fields
  if (!marker.plan_id || marker.x_norm === null || marker.y_norm === null || marker.x_norm === undefined || marker.y_norm === undefined) {
    console.warn(`[symbolCropper] Marker ${stromkreisId} is missing plan_id, x_norm, or y_norm. Skipping.`);
    return;
  }

  // 2. Duplicate Protection (stromkreis_id, plan_id, x_norm, y_norm)
  const { data: existing } = await supabase
    .from("symbol_crops")
    .select("id")
    .eq("stromkreis_id", stromkreisId)
    .eq("plan_id", marker.plan_id)
    .eq("metadata->>x_norm", String(marker.x_norm))
    .eq("metadata->>y_norm", String(marker.y_norm))
    .maybeSingle();

  if (existing) {
    console.log(`[symbolCropper] Crop already exists for stromkreis ${stromkreisId} at coordinates (${marker.x_norm}, ${marker.y_norm}). Skipping.`);
    return;
  }

  // Fetch plan path and dimensions
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("storage_path, image_width, image_height")
    .eq("id", marker.plan_id)
    .single();

  if (planErr || !plan || !plan.storage_path) {
    console.error(`[symbolCropper] Plan not found or missing storage_path for plan ${marker.plan_id}:`, planErr);
    return;
  }

  // Find meta.json in tiles folder to read grid dimensions
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

  let gridW = 0;
  let gridH = 0;

  if (meta && meta.gridW && meta.gridH) {
    gridW = meta.gridW;
    gridH = meta.gridH;
  } else {
    // Fallback: gridW = ceil(image_width / 256)
    if (plan.image_width && plan.image_height) {
      gridW = Math.ceil(plan.image_width / 256);
      gridH = Math.ceil(plan.image_height / 256);
    } else {
      console.error(`[symbolCropper] Grid size could not be determined for plan ${marker.plan_id}`);
      return;
    }
  }

  // PDF DOWNLOAD
  const { data: pdfData, error: dlErr } = await supabase.storage
    .from("plans")
    .download(plan.storage_path);

  if (dlErr || !pdfData) {
    console.error(`[symbolCropper] Failed to download PDF for plan ${marker.plan_id}:`, dlErr);
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "crop-"));
  const pdfPath = path.join(workDir, "input.pdf");

  try {
    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
    await fs.writeFile(pdfPath, pdfBuffer);

    // PDF RENDERING (150 DPI, page 1)
    const pngBase = path.join(workDir, "page");
    await execFileAsync("pdftoppm", ["-png", "-r", String(DPI), pdfPath, pngBase]);
    const page1Png = `${pngBase}-1.png`;

    const flattenedPng = path.join(workDir, "flattened.png");
    try {
      await execFileAsync("convert", [page1Png, "-background", "white", "-alpha", "remove", "-alpha", "off", flattenedPng]);
    } catch {
      await fs.copyFile(page1Png, flattenedPng);
    }

    const sharpImg = sharp(flattenedPng);
    const imgMeta = await sharpImg.metadata();
    const imgW = imgMeta.width || 0;
    const imgH = imgMeta.height || 0;

    // COORDINATE CONVERSION
    const virtualWidth = gridW * 256;
    const virtualHeight = gridH * 256;

    const pixelX = Math.round(marker.x_norm * virtualWidth);
    const pixelY = Math.round(marker.y_norm * virtualHeight);

    // Generate crop variants: 128, 256, 512
    const sizes = [128, 256, 512];
    const cropPaths: Record<number, string> = {};

    for (const size of sizes) {
      const croppedFile = await cropVariant(sharpImg, {
        size,
        pixelX,
        pixelY,
        imgW,
        imgH,
        workDir,
        planId: marker.plan_id,
        stromkreisId: stromkreisId,
        supabase,
      });
      cropPaths[size] = croppedFile;
    }

    // QUALITY ANALYSIS (on the main 256px crop)
    const path256 = cropPaths[256];
    const stats256 = await sharp(path256).stats();
    const brightness = stats256.channels.reduce((sum, c) => sum + c.mean, 0) / stats256.channels.length;

    // Edge detection using Sobel filter
    const { data: rawPixels, info: rawInfo } = await sharp(path256)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = rawInfo.width;
    const h = rawInfo.height;
    let edgePixels = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        // Sobel kernels
        const gx = (
          -rawPixels[(y - 1) * w + (x - 1)] + rawPixels[(y - 1) * w + (x + 1)] +
          -2 * rawPixels[y * w + (x - 1)] + 2 * rawPixels[y * w + (x + 1)] +
          -rawPixels[(y + 1) * w + (x - 1)] + rawPixels[(y + 1) * w + (x + 1)]
        );

        const gy = (
          -rawPixels[(y - 1) * w + (x - 1)] - 2 * rawPixels[(y - 1) * w + x] - rawPixels[(y - 1) * w + (x + 1)] +
          rawPixels[(y + 1) * w + (x - 1)] + 2 * rawPixels[(y + 1) * w + x] + rawPixels[(y + 1) * w + (x + 1)]
        );

        const val = Math.sqrt(gx * gx + gy * gy);
        if (val > 30) {
          edgePixels++;
        }
      }
    }

    const edgeDensity = edgePixels / (w * h);
    const containsLines = edgeDensity > EDGE_DENSITY_THRESHOLD;

    // Quality decision
    // IMPORTANT: Manual markers are ALWAYS ground truth (approved).
    // Automated visual QC (edge density / brightness) only applies to AI crops.
    const isCorrectBrightness = brightness >= 20 && brightness <= 240;
    const isPassed = isCorrectBrightness && containsLines;
    // Manual marker → always "approved" (ground truth dataset)
    // The "failed" status is reserved exclusively for AI negative-learning crops.
    const qualityStatus = "approved";

    let qualityScore = 0;
    if (isPassed) {
      const brightnessFactor = 1 - Math.abs(brightness - 180) / 180;
      qualityScore = Number((0.5 + Math.min(0.5, edgeDensity * 15) + brightnessFactor * 0.1).toFixed(4));
      if (qualityScore > 1) qualityScore = 1;
    } else {
      qualityScore = Number((edgeDensity * 10).toFixed(4));
    }

    // AI DATASET METADATA (clip_prompt JSON)
    const symbolType = marker.metadata?.realType || marker.type || "socket";
    const isSocket = symbolType.toLowerCase().includes("socket") || symbolType.toLowerCase().includes("gniazdo");
    const defaultCable = isSocket ? "NYM-J 3x2.5" : "NYM-J 3x1.5";
    const kabeltyp = marker.metadata?.kabeltyp || marker.kabeltyp || defaultCable;
    const breaker = `${marker.breaker_curve || "B"}${marker.breaker_current || 16}`;
    const phaseStr = marker.phase === 3 ? "three phase" : "single phase";

    const clipPrompt = {
      symbol: "electrical plan symbol",
      type: symbolType,
      circuit_code: marker.circuit_code,
      cable: kabeltyp,
      breaker: breaker,
      phase: phaseStr,
      environment: "building electrical installation"
    };

    const mainImagePath = `crops/${marker.plan_id}/${stromkreisId}/256.png`;

    const metadataField = {
      circuit_code: marker.circuit_code,
      breaker_current: marker.breaker_current ? `${marker.breaker_current}A` : "16A",
      breaker_curve: marker.breaker_curve || "B",
      phase: marker.phase === 3 ? "L1/L2/L3" : `L${marker.phase || 1}`,
      kabeltyp: kabeltyp,
      x_norm: marker.x_norm,
      y_norm: marker.y_norm,
      crop_size: 256,
      dpi: DPI,
      quality_score: qualityScore,
      quality_status: qualityStatus,
      brightness: Number(brightness.toFixed(4)),
      edge_density: Number(edgeDensity.toFixed(4)),
      contains_lines: containsLines,
      variants: ["128", "256", "512"]
    };

    // Generate 768-vector embedding directly from crop image buffer
    let embeddingVector: number[] | null = null;
    try {
      embeddingVector = await generateImageEmbedding(path256);
    } catch (embErr: any) {
      console.error("[symbolCropper] Failed to generate embedding:", embErr.message);
    }

    // DATABASE INSERT (upsert by unique constraint unique_symbol_crop)
    const { error: insertErr } = await supabase
      .from("symbol_crops")
      .upsert({
        stromkreis_id: stromkreisId,
        plan_id: marker.plan_id,
        image_path: mainImagePath,
        symbol_type: symbolType,
        clip_prompt: clipPrompt,
        metadata: metadataField,
        quality_score: qualityScore,
        quality_status: qualityStatus,
        brightness: Number(brightness.toFixed(4)),
        edge_density: Number(edgeDensity.toFixed(4)),
        contains_lines: containsLines,
        embedding: embeddingVector,
        embedding_status: embeddingVector ? "completed" : "pending"
      }, {
        onConflict: "stromkreis_id"
      });

    if (insertErr) {
      throw insertErr;
    }

    console.log(`[symbolCropper] Crop generation completed successfully for ${stromkreisId}. Status: ${qualityStatus}, Score: ${qualityScore}`);
  } catch (err: any) {
    console.error(`[symbolCropper] Crop pipeline error for ${stromkreisId}:`, err.message);
  } finally {
    // Cleanup temporary files
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
