#!/usr/bin/env node
/**
 * TASK: Implement SYMBOL_CROP_GENERATOR_V3 (Context-Aware Hybrid Crop Experiment)
 *
 * Steps:
 * 1. Reuse V2.1 Connected Components detection.
 * 2. Generate 4 context margins: 6px, 16px, 24px, 32px.
 * 3. Preserve CAD scale (paste centered in 256x256 canvas without enlarging; scale down only if > 256).
 * 4. Save experimental crops to Supabase Storage `symbol-crops` under `symbol_crops_v3/margin_${margin}/...`
 * 5. Generate 768d embeddings for each margin and store in metadata (embedding_v3_margin6, etc.).
 * 6. Run retrieval benchmark comparing OLD (V1), V2.1, V3 margin6, V3 margin16, V3 margin24, V3 margin32.
 * 7. Evaluate confusion matrix for key symbol pairs.
 * 8. Perform scale analysis.
 * 9. Generate symbol_crop_v3_experiment_report.json.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE env variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const REPORT_OUTPUT_PATH = path.resolve(__dirname, "../symbol_crop_v3_experiment_report.json");
const MARGINS = [6, 16, 24, 32];
const EMBEDDING_DIM = 768;

const cacheDir = path.join(os.tmpdir(), "symbol_crop_v2_cache");

// Re-use V2.1 CC Detection from scripts/symbolCropperV2.cjs
const { findTargetSymbolComponentsV21 } = require("./symbolCropperV2.cjs");

// Re-use Embedding Generator logic
async function generateImageEmbedding(imageBuffer) {
  const rawImg = sharp(imageBuffer);

  const { data: rawRgb256, info: info256 } = await rawImg
    .clone().resize(16, 16, { fit: "fill" }).toFormat("raw").toBuffer({ resolveWithObject: true });
  const ch256 = info256.channels || 3;
  const line256 = [], green256 = [];
  for (let i = 0; i < rawRgb256.length; i += ch256) {
    const r = rawRgb256[i], g = rawRgb256[i+1], b = rawRgb256[i+2];
    const lum = (r + g + b) / 3;
    line256.push(Math.max(0, (245 - lum) / 245));
    green256.push((g > 60 && g > r+18 && g > b+18) ? Math.min(1.0, (g - Math.max(r,b)) / 80) : 0);
  }

  const { data: rawRgb128, info: info128 } = await rawImg
    .clone().resize(16, 8, { fit: "fill" }).toFormat("raw").toBuffer({ resolveWithObject: true });
  const ch128 = info128.channels || 3;
  const red128 = [];
  for (let i = 0; i < rawRgb128.length; i += ch128) {
    const r = rawRgb128[i], g = rawRgb128[i+1], b = rawRgb128[i+2];
    red128.push((r > 60 && r > g+18 && r > b+18) ? Math.min(1.0, (r - Math.max(g,b)) / 80) : 0);
  }

  const gray8 = await rawImg.clone().grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const edge64 = new Array(64).fill(0);
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) {
    const gx = (-gray8[(y-1)*8+(x-1)] + gray8[(y-1)*8+(x+1)] - 2*gray8[y*8+(x-1)] + 2*gray8[y*8+(x+1)] - gray8[(y+1)*8+(x-1)] + gray8[(y+1)*8+(x+1)]);
    const gy = (-gray8[(y-1)*8+(x-1)] - 2*gray8[(y-1)*8+x] - gray8[(y-1)*8+(x+1)] + gray8[(y+1)*8+(x-1)] + 2*gray8[(y+1)*8+x] + gray8[(y+1)*8+(x+1)]);
    edge64[y*8+x] = Math.min(1.0, Math.sqrt(gx*gx + gy*gy) / 255);
  }

  const proj32 = await rawImg.clone().grayscale().resize(32, 32, { fit: "fill" }).raw().toBuffer();
  const horP = new Array(32).fill(0), verP = new Array(32).fill(0);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = Math.max(0, (245 - proj32[y*32+x]) / 245);
    horP[y] += v; verP[x] += v;
  }
  const proj64 = [...horP.map(v => Math.min(1.0, v/32)), ...verP.map(v => Math.min(1.0, v/32))];

  const vector = [...line256, ...green256, ...red128, ...edge64, ...proj64];
  while (vector.length < EMBEDDING_DIM) vector.push(0);
  const finalVector = vector.slice(0, EMBEDDING_DIM);
  const sumSq = finalVector.reduce((s, v) => s + v*v, 0);
  const mag = Math.sqrt(sumSq);
  return mag > 0 ? finalVector.map(v => Number((v / mag).toFixed(6))) : finalVector;
}

function parseEmbedding(raw) {
  if (!raw) return null;
  try {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") return JSON.parse(raw);
    return null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  const d = Math.sqrt(mA) * Math.sqrt(mB);
  return d > 0 ? dot / d : 0;
}

async function createHybridCropV3(rawSharpImg, cropBbox, canvasSize = 256) {
  const extracted = await rawSharpImg.clone().extract(cropBbox).png().toBuffer();

  if (cropBbox.width <= canvasSize && cropBbox.height <= canvasSize) {
    const leftOffset = Math.round((canvasSize - cropBbox.width) / 2);
    const topOffset = Math.round((canvasSize - cropBbox.height) / 2);

    return sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: extracted, left: leftOffset, top: topOffset }])
      .png()
      .toBuffer();
  } else {
    return sharp(extracted)
      .resize(canvasSize, canvasSize, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();
  }
}

async function runV3Experiment() {
  console.log("=================================================");
  console.log("  SYMBOL_CROP_GENERATOR_V3 EXPERIMENT");
  console.log("=================================================");

  await fs.mkdir(cacheDir, { recursive: true });

  // 1. Fetch approved crops
  const { data: approvedCrops, error: cropsErr } = await supabase
    .from("symbol_crops")
    .select("id, stromkreis_id, plan_id, symbol_type, metadata")
    .eq("quality_status", "approved");

  if (cropsErr || !approvedCrops) {
    throw new Error(`Failed to fetch approved crops: ${cropsErr?.message}`);
  }

  console.log(`Loaded ${approvedCrops.length} approved symbol_crops from DB.`);

  // Pre-fetch all markers from stromkreise
  const markerMap = {};
  const { data: allMarkers } = await supabase
    .from("stromkreise")
    .select("id, x_norm, y_norm, type, plan_id")
    .limit(2000);

  (allMarkers || []).forEach(m => { markerMap[m.id] = m; });
  console.log(`Pre-fetched ${Object.keys(markerMap).length} markers.`);

  // Group by plan_id
  const planMap = {};
  for (const crop of approvedCrops) {
    if (!planMap[crop.plan_id]) planMap[crop.plan_id] = [];
    planMap[crop.plan_id].push(crop);
  }

  const planIds = Object.keys(planMap);
  console.log(`Grouped into ${planIds.length} plans.`);

  const scaleStats = {
    symbolBeforeCropW: [],
    symbolBeforeCropH: [],
    cropSizePerMargin: { 6: [], 16: [], 24: [], 32: [] },
    contextPixelsPerMargin: { 6: [], 16: [], 24: [], 32: [] }
  };

  let totalProcessed = 0;
  let successCount = 0;

  // Process plans
  for (let pIdx = 0; pIdx < planIds.length; pIdx++) {
    const planId = planIds[pIdx];
    const crops = planMap[planId];
    console.log(`\n--- Plan [${pIdx + 1}/${planIds.length}] ${planId} (${crops.length} crops) ---`);

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("id, pdf_path, storage_path, image_width, image_height")
      .eq("id", planId)
      .single();

    if (planErr || !plan) {
      console.error(`Skipping plan ${planId}: ${planErr?.message}`);
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

      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "crop-v3-full-"));
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
      totalProcessed++;
      const marker = markerMap[crop.stromkreis_id];
      if (!marker) continue;

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

      if (detRes.detectionMethod === "FAILED" || !detRes.mergedBbox) {
        continue;
      }

      successCount++;
      const targetComp = detRes.mergedBbox;
      const compW = targetComp.width;
      const compH = targetComp.height;

      scaleStats.symbolBeforeCropW.push(compW);
      scaleStats.symbolBeforeCropH.push(compH);

      const v3Embeddings = {};

      // For each margin variant
      for (const margin of MARGINS) {
        const left = Math.max(0, targetComp.minX - margin);
        const top = Math.max(0, targetComp.minY - margin);
        const right = Math.min(imgW, targetComp.maxX + margin);
        const bottom = Math.min(imgH, targetComp.maxY + margin);
        const cropBbox = { left, top, width: right - left, height: bottom - top };

        scaleStats.cropSizePerMargin[margin].push(cropBbox.width * cropBbox.height);
        scaleStats.contextPixelsPerMargin[margin].push(cropBbox.width * cropBbox.height - compW * compH);

        // Step 3: Hybrid Crop preserving relative scale
        const final256Buffer = await createHybridCropV3(sharpImg, cropBbox, 256);

        // Step 4: Storage Upload to symbol-crops bucket
        const uploadPathV3 = `symbol_crops_v3/margin_${margin}/${planId}/${crop.stromkreis_id}/256.png`;
        await supabase.storage.from("symbol-crops").upload(uploadPathV3, final256Buffer, {
          contentType: "image/png",
          upsert: true
        });

        // Step 5: Embedding generation
        const embV3 = await generateImageEmbedding(final256Buffer);
        v3Embeddings[`embedding_v3_margin${margin}`] = embV3;
      }

      // Save V3 embeddings to metadata without modifying existing fields
      const updatedMeta = {
        ...(crop.metadata || {}),
        ...v3Embeddings,
        v3_generated_at: new Date().toISOString()
      };

      await supabase
        .from("symbol_crops")
        .update({ metadata: updatedMeta })
        .eq("id", crop.id);
    }
  }

  console.log(`\n[V3 EXPERIMENT CROPS & EMBEDDINGS COMPLETED]`);
  console.log(`Processed ${totalProcessed} records. Successfully generated V3 variants for ${successCount} symbols.`);

  // Step 6 & 7: Retrieval Benchmark across ALL 6 pipelines (OLD, V2.1, V3_6, V3_16, V3_24, V3_32)
  console.log("\n=================================================");
  console.log("  RUNNING RETRIEVAL BENCHMARK ACROSS 6 PIPELINES");
  console.log("=================================================");

  const evalDataset = [];
  let page = 0;
  while (true) {
    const { data: pageData } = await supabase
      .from("symbol_crops")
      .select("id, stromkreis_id, symbol_type, embedding, metadata")
      .eq("quality_status", "approved")
      .range(page * 500, (page + 1) * 500 - 1);

    if (!pageData || pageData.length === 0) break;

    for (const r of pageData) {
      const embOld = parseEmbedding(r.embedding);
      const embV2 = r.metadata?.embedding_v2 ? parseEmbedding(r.metadata.embedding_v2) : null;
      const embV3_6 = r.metadata?.embedding_v3_margin6 ? parseEmbedding(r.metadata.embedding_v3_margin6) : null;
      const embV3_16 = r.metadata?.embedding_v3_margin16 ? parseEmbedding(r.metadata.embedding_v3_margin16) : null;
      const embV3_24 = r.metadata?.embedding_v3_margin24 ? parseEmbedding(r.metadata.embedding_v3_margin24) : null;
      const embV3_32 = r.metadata?.embedding_v3_margin32 ? parseEmbedding(r.metadata.embedding_v3_margin32) : null;

      if (embOld && embV2 && embV3_6 && embV3_16 && embV3_24 && embV3_32 && r.symbol_type) {
        evalDataset.push({
          id: r.id,
          symbol_type: r.symbol_type,
          embOld,
          embV2,
          embV3_6,
          embV3_16,
          embV3_24,
          embV3_32
        });
      }
    }
    page++;
  }

  console.log(`Loaded ${evalDataset.length} items with complete embeddings across all 6 pipelines.`);
  const N = evalDataset.length;

  const pipelines = [
    { key: "OLD", label: "V1 (Fixed Context 256px)", field: "embOld" },
    { key: "V2.1", label: "V2.1 (Pure Crop 6px + Contain Scale)", field: "embV2" },
    { key: "V3_margin6", label: "V3 (Margin 6px + CAD Scale Preserved)", field: "embV3_6" },
    { key: "V3_margin16", label: "V3 (Margin 16px + CAD Scale Preserved)", field: "embV3_16" },
    { key: "V3_margin24", label: "V3 (Margin 24px + CAD Scale Preserved)", field: "embV3_24" },
    { key: "V3_margin32", label: "V3 (Margin 32px + CAD Scale Preserved)", field: "embV3_32" }
  ];

  const confusionPairs = [
    ["socket", "edv"],
    ["socket", "sym_socket"],
    ["light", "special"],
    ["cee", "socket"]
  ];

  const benchmarkResults = {};

  const classCounts = {};
  for (const item of evalDataset) {
    classCounts[item.symbol_type] = (classCounts[item.symbol_type] || 0) + 1;
  }

  for (const pipe of pipelines) {
    console.log(`Evaluating pipeline: ${pipe.label}...`);
    let p1Sum = 0, p5Sum = 0, r10Sum = 0, mrrSum = 0, falseMatches = 0;

    const confusionMap = {};
    for (const [a, b] of confusionPairs) {
      confusionMap[`${a}->${b}`] = 0;
      confusionMap[`${b}->${a}`] = 0;
    }

    for (let i = 0; i < N; i++) {
      const query = evalDataset[i];
      const qEmb = query[pipe.field];

      const scores = [];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const cand = evalDataset[j];
        const cEmb = cand[pipe.field];
        scores.push({ type: cand.symbol_type, score: cosineSimilarity(qEmb, cEmb) });
      }

      scores.sort((a, b) => b.score - a.score);

      const top1 = scores[0];
      const top5 = scores.slice(0, 5);
      const top10 = scores.slice(0, 10);

      // Precision@1
      if (top1.type === query.symbol_type) {
        p1Sum += 1;
      } else {
        falseMatches += 1;
        const key = `${query.symbol_type}->${top1.type}`;
        if (confusionMap[key] !== undefined) confusionMap[key] += 1;
      }

      // Precision@5
      const matches5 = top5.filter(s => s.type === query.symbol_type).length;
      p5Sum += matches5 / 5;

      // Recall@10
      const totalSame = classCounts[query.symbol_type] - 1;
      const matches10 = top10.filter(s => s.type === query.symbol_type).length;
      r10Sum += totalSame > 0 ? Math.min(1.0, matches10 / totalSame) : 1.0;

      // MRR
      let rank = 0;
      for (let r = 0; r < scores.length; r++) {
        if (scores[r].type === query.symbol_type) {
          rank = r + 1;
          break;
        }
      }
      mrrSum += rank > 0 ? 1 / rank : 0;
    }

    benchmarkResults[pipe.key] = {
      label: pipe.label,
      precision1: Math.round((p1Sum / N) * 10000) / 10000,
      precision5: Math.round((p5Sum / N) * 10000) / 10000,
      recall10: Math.round((r10Sum / N) * 10000) / 10000,
      mrr: Math.round((mrrSum / N) * 10000) / 10000,
      false_match_rate: Math.round((falseMatches / N) * 10000) / 10000,
      confusion: confusionMap
    };
  }

  // Scale analysis summary
  const avgW = scaleStats.symbolBeforeCropW.reduce((a, b) => a + b, 0) / (scaleStats.symbolBeforeCropW.length || 1);
  const avgH = scaleStats.symbolBeforeCropH.reduce((a, b) => a + b, 0) / (scaleStats.symbolBeforeCropH.length || 1);

  const scaleAnalysis = {
    average_symbol_size_px: `${Math.round(avgW * 100) / 100} x ${Math.round(avgH * 100) / 100}`,
    average_crop_area_per_margin: {
      margin_6: Math.round(scaleStats.cropSizePerMargin[6].reduce((a,b) => a+b, 0) / scaleStats.cropSizePerMargin[6].length),
      margin_16: Math.round(scaleStats.cropSizePerMargin[16].reduce((a,b) => a+b, 0) / scaleStats.cropSizePerMargin[16].length),
      margin_24: Math.round(scaleStats.cropSizePerMargin[24].reduce((a,b) => a+b, 0) / scaleStats.cropSizePerMargin[24].length),
      margin_32: Math.round(scaleStats.contextPixelsPerMargin[32].reduce((a,b) => a+b, 0) / scaleStats.cropSizePerMargin[32].length)
    },
    average_context_pixels_added: {
      margin_6: Math.round(scaleStats.contextPixelsPerMargin[6].reduce((a,b) => a+b, 0) / scaleStats.contextPixelsPerMargin[6].length),
      margin_16: Math.round(scaleStats.contextPixelsPerMargin[16].reduce((a,b) => a+b, 0) / scaleStats.contextPixelsPerMargin[16].length),
      margin_24: Math.round(scaleStats.contextPixelsPerMargin[24].reduce((a,b) => a+b, 0) / scaleStats.contextPixelsPerMargin[24].length),
      margin_32: Math.round(scaleStats.contextPixelsPerMargin[32].reduce((a,b) => a+b, 0) / scaleStats.contextPixelsPerMargin[32].length)
    }
  };

  // Find best pipeline by Precision@1
  let bestPipeKey = "OLD";
  let bestP1 = -1;
  for (const k of Object.keys(benchmarkResults)) {
    if (benchmarkResults[k].precision1 > bestP1) {
      bestP1 = benchmarkResults[k].precision1;
      bestPipeKey = k;
    }
  }

  const experimentReport = {
    generated_at: new Date().toISOString(),
    total_queries: N,
    scale_analysis: scaleAnalysis,
    benchmark_results: benchmarkResults,
    recommended_pipeline: bestPipeKey,
    recommended_pipeline_precision1: bestP1,
    conclusions: {
      best_margin: bestPipeKey.startsWith("V3") ? bestPipeKey.split("margin")[1] : "N/A",
      cad_scale_preservation_effective: benchmarkResults.V3_margin6.precision1 > benchmarkResults["V2.1"].precision1,
      local_context_improves_precision1: benchmarkResults.V3_margin24.precision1 > benchmarkResults.V3_margin6.precision1,
      socket_edv_confusion_minimized_by: Object.keys(benchmarkResults).reduce((best, k) => {
        const confSum = (benchmarkResults[k].confusion["socket->edv"] || 0) + (benchmarkResults[k].confusion["edv->socket"] || 0);
        const bestSum = (benchmarkResults[best].confusion["socket->edv"] || 0) + (benchmarkResults[best].confusion["edv->socket"] || 0);
        return confSum < bestSum ? k : best;
      }, "OLD")
    }
  };

  await fs.writeFile(REPORT_OUTPUT_PATH, JSON.stringify(experimentReport, null, 2), "utf8");

  console.log("\n=================================================");
  console.log("  V3 EXPERIMENT SUMMARY RESULTS");
  console.log("=================================================");
  console.log(`Total Queries: ${N}`);
  console.log("");
  console.log("Pipeline COMPARISON:");
  console.log("  Pipeline        | Precision@1 | Precision@5 | MRR    | FMR    | Socket<->EDV Conf");
  for (const k of Object.keys(benchmarkResults)) {
    const res = benchmarkResults[k];
    const sockEdv = (res.confusion["socket->edv"] || 0) + (res.confusion["edv->socket"] || 0);
    console.log(`  ${k.padEnd(15)} | ${(res.precision1 * 100).toFixed(2)}%     | ${(res.precision5 * 100).toFixed(2)}%     | ${res.mrr.toFixed(4)} | ${(res.false_match_rate * 100).toFixed(2)}%  | ${sockEdv}`);
  }
  console.log("");
  console.log(`RECOMMENDED PIPELINE: ${bestPipeKey} (Precision@1 = ${(bestP1 * 100).toFixed(2)}%)`);
  console.log(`Report JSON saved to: ${REPORT_OUTPUT_PATH}`);
  console.log("=================================================");
}

runV3Experiment().catch(err => {
  console.error("Experiment V3 error:", err);
  process.exit(1);
});
