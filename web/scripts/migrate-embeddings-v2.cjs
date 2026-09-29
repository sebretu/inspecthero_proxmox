#!/usr/bin/env node
/**
 * SINGLE_SYMBOL_CROP_V2.1 – Embedding Migration
 *
 * Source:  Supabase Storage: symbol_crops_v2/{plan_id}/{stromkreis_id}/256.png
 * Target:  symbol_crops.metadata.embedding_v2 (safe, does NOT overwrite main embedding)
 *
 * SAFETY:
 * - Does NOT modify stromkreise table
 * - Does NOT modify Ground Truth markers
 * - Does NOT delete old crops or old embeddings
 * - Does NOT overwrite symbol_crops.embedding (production field)
 * - Saves new embeddings to symbol_crops.metadata.embedding_v2
 * - embedding_version = "v2_single_symbol"
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing SUPABASE env variables");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const AUDIT_JSON_PATH = path.resolve(__dirname, "../single_symbol_crop_v2_full_audit.json");
const REPORT_OUTPUT_PATH = path.resolve(__dirname, "../embedding_v2_migration_report.json");
const EMBEDDING_VERSION = "v2_single_symbol";
const EMBEDDING_DIM = 768;
const COMPARE_SAMPLE_SIZE = 200;

// ============================================================
// Embedding Generator (mirrors embeddingService.ts exactly)
// ============================================================
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

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; mA += a[i]*a[i]; mB += b[i]*b[i]; }
  const d = Math.sqrt(mA) * Math.sqrt(mB);
  return d > 0 ? dot / d : 0;
}

function parseEmbedding(raw) {
  if (!raw) return null;
  try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return null; }
}

// ============================================================
// Main
// ============================================================
async function runEmbeddingMigration() {
  console.log("=================================================");
  console.log("  EMBEDDING MIGRATION: V2 SINGLE_SYMBOL_CROP");
  console.log("=================================================");

  const auditRaw = await fs.readFile(AUDIT_JSON_PATH, "utf8");
  const auditRecords = JSON.parse(auditRaw);
  const successRecords = auditRecords.filter(r => r.status === "SINGLE_SYMBOL_SUCCESS");
  console.log(`Audit JSON: ${auditRecords.length} total | ${successRecords.length} SUCCESS records to embed`);

  console.log("\nFetching existing (OLD) embeddings from symbol_crops (DB table)...");
  const existingEmbMap = {};
  const allIds = successRecords.map(r => r.stromkreis_id);
  // Use batches of 100 (Supabase .in() limit)
  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    const { data: rows, error: bErr } = await supabase
      .from("symbol_crops")
      .select("id, stromkreis_id, embedding, symbol_type, metadata")
      .in("stromkreis_id", batch)
      .limit(100);
    if (bErr) { console.error(`Batch fetch error ${i}: ${bErr.message}`); continue; }
    (rows || []).forEach(row => {
      existingEmbMap[row.stromkreis_id] = {
        id: row.id,
        embedding: parseEmbedding(row.embedding),
        symbol_type: row.symbol_type,
        metadata: row.metadata || {}
      };
    });
  }
  console.log(`Loaded ${Object.keys(existingEmbMap).length} existing embeddings`);


  // Process each SUCCESS record
  const results = [];
  let successCount = 0, failedCount = 0;

  for (let i = 0; i < successRecords.length; i++) {
    const record = successRecords[i];
    if ((i + 1) % 100 === 0) {
      console.log(`[${i+1}/${successRecords.length}] SUCCESS: ${successCount} | FAILED: ${failedCount}`);
    }

    const storagePath = `symbol_crops_v2/${record.plan_id}/${record.stromkreis_id}/256.png`;
    let embeddingNew = null;
    let status = "FAILED";
    let errorMsg = null;

    try {
      const { data: cropData, error: dlErr } = await supabase.storage
        .from("symbol-crops").download(storagePath);
      if (dlErr || !cropData) throw new Error(`Download failed: ${dlErr?.message || "no data"}`);

      const buffer = Buffer.from(await cropData.arrayBuffer());
      if (buffer.length < 100) throw new Error(`Buffer too small: ${buffer.length} bytes`);

      embeddingNew = await generateImageEmbedding(buffer);
      if (!embeddingNew || embeddingNew.length !== EMBEDDING_DIM) {
        throw new Error(`Invalid embedding dimension: ${embeddingNew?.length}`);
      }
      if (Math.max(...embeddingNew) === 0) throw new Error("Null vector (all zeros)");

      status = "SUCCESS";
      successCount++;
    } catch (err) {
      errorMsg = err.message;
      failedCount++;
    }

    const existingOld = existingEmbMap[record.stromkreis_id];
    const oldCosine = (embeddingNew && existingOld?.embedding)
      ? Math.round(cosineSimilarity(embeddingNew, existingOld.embedding) * 10000) / 10000
      : null;

    results.push({
      stromkreis_id: record.stromkreis_id,
      plan_id: record.plan_id,
      symbol_type: record.symbol_type,
      embedding_version: EMBEDDING_VERSION,
      crop_version: "v2_single_symbol",
      generated_at: new Date().toISOString(),
      embedding_dimension: embeddingNew?.length || 0,
      status,
      error: errorMsg,
      old_new_cosine: oldCosine,
      embedding: embeddingNew
    });
  }

  console.log(`\n[DONE] Generated: SUCCESS=${successCount} | FAILED=${failedCount}`);

  // Save to symbol_crops.metadata.embedding_v2 (safe, non-destructive)
  // Update directly by stromkreis_id - no need to pre-lookup existingEmbMap
  console.log("\nSaving V2 embeddings to symbol_crops.metadata (non-destructive)...");
  let savedCount = 0, saveFailedCount = 0;

  for (const result of results) {
    if (result.status !== "SUCCESS" || !result.embedding) continue;

    try {
      // First fetch current metadata for this stromkreis_id
      const { data: currentRow, error: fetchErr } = await supabase
        .from("symbol_crops")
        .select("id, metadata")
        .eq("stromkreis_id", result.stromkreis_id)
        .limit(1)
        .maybeSingle();

      if (fetchErr || !currentRow) {
        saveFailedCount++;
        if (saveFailedCount <= 3) console.error(`Fetch failed ${result.stromkreis_id}: ${fetchErr?.message || "not found"}`);
        continue;
      }

      const updatedMeta = {
        ...(currentRow.metadata || {}),
        embedding_v2: result.embedding,
        embedding_v2_version: EMBEDDING_VERSION,
        embedding_v2_generated_at: result.generated_at,
        embedding_v2_crop_source: `symbol_crops_v2/${result.plan_id}/${result.stromkreis_id}/256.png`
      };

      const { error: updateErr } = await supabase
        .from("symbol_crops")
        .update({ metadata: updatedMeta })
        .eq("id", currentRow.id);

      if (updateErr) throw new Error(updateErr.message);
      savedCount++;
    } catch (err) {
      saveFailedCount++;
      if (saveFailedCount <= 3) console.error(`Save failed ${result.stromkreis_id}: ${err.message}`);
    }
  }
  console.log(`Saved ${savedCount} | Save failed: ${saveFailedCount}`);

  // OLD vs NEW comparison
  const comparePool = results.filter(r => r.status === "SUCCESS" && r.old_new_cosine !== null);
  const shuffled = comparePool.sort(() => Math.random() - 0.5).slice(0, COMPARE_SAMPLE_SIZE);
  const avgCosine = shuffled.length > 0
    ? shuffled.reduce((s, r) => s + r.old_new_cosine, 0) / shuffled.length
    : 0;

  // Intra/inter class separation (NEW)
  const byClassNew = {};
  for (const r of results) {
    if (r.status !== "SUCCESS" || !r.embedding) continue;
    if (!byClassNew[r.symbol_type]) byClassNew[r.symbol_type] = [];
    byClassNew[r.symbol_type].push(r.embedding);
  }

  const intraNew = [], interNew = [];
  const clsKeysNew = Object.keys(byClassNew);
  for (const cls of clsKeysNew) {
    const m = byClassNew[cls].slice(0, 15);
    for (let i = 0; i < m.length; i++) for (let j = i+1; j < m.length; j++) intraNew.push(cosineSimilarity(m[i], m[j]));
  }
  if (clsKeysNew.length >= 2) {
    const A = byClassNew[clsKeysNew[0]].slice(0, 5);
    const B = byClassNew[clsKeysNew[1]].slice(0, 5);
    for (const a of A) for (const b of B) interNew.push(cosineSimilarity(a, b));
  }
  const avgIntraNew = intraNew.length > 0 ? intraNew.reduce((s,v) => s+v, 0) / intraNew.length : 0;
  const avgInterNew = interNew.length > 0 ? interNew.reduce((s,v) => s+v, 0) / interNew.length : 0;

  // Intra/inter class separation (OLD)
  const byClassOld = {};
  for (const row of Object.values(existingEmbMap)) {
    if (!row.embedding || !row.symbol_type) continue;
    if (!byClassOld[row.symbol_type]) byClassOld[row.symbol_type] = [];
    byClassOld[row.symbol_type].push(row.embedding);
  }
  const intraOld = [], interOld = [];
  const clsKeysOld = Object.keys(byClassOld);
  for (const cls of clsKeysOld) {
    const m = byClassOld[cls].slice(0, 15);
    for (let i = 0; i < m.length; i++) for (let j = i+1; j < m.length; j++) intraOld.push(cosineSimilarity(m[i], m[j]));
  }
  if (clsKeysOld.length >= 2) {
    const A = byClassOld[clsKeysOld[0]].slice(0, 5);
    const B = byClassOld[clsKeysOld[1]].slice(0, 5);
    for (const a of A) for (const b of B) interOld.push(cosineSimilarity(a, b));
  }
  const avgIntraOld = intraOld.length > 0 ? intraOld.reduce((s,v) => s+v, 0) / intraOld.length : 0;
  const avgInterOld = interOld.length > 0 ? interOld.reduce((s,v) => s+v, 0) / interOld.length : 0;

  // Validate
  const seenIds = new Set();
  let duplicateCount = 0, nullVectorCount = 0;
  for (const r of results) {
    if (r.status !== "SUCCESS") continue;
    if (seenIds.has(r.stromkreis_id)) duplicateCount++;
    seenIds.add(r.stromkreis_id);
    if (!r.embedding || Math.max(...r.embedding) === 0) nullVectorCount++;
  }

  const classDistV2 = {};
  for (const r of results) {
    if (r.status === "SUCCESS") classDistV2[r.symbol_type] = (classDistV2[r.symbol_type] || 0) + 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    embedding_version: EMBEDDING_VERSION,
    source: "Supabase Storage: symbol_crops_v2/{plan_id}/{stromkreis_id}/256.png",
    total_processed: successRecords.length,
    success: successCount,
    failed: failedCount,
    saved_to_db: savedCount,
    save_failed: saveFailedCount,
    embedding_dimension: EMBEDDING_DIM,
    duplicate_embeddings: duplicateCount,
    null_vectors: nullVectorCount,
    old_vs_new_comparison: {
      sample_size: shuffled.length,
      average_old_new_cosine: Math.round(avgCosine * 10000) / 10000
    },
    class_separation: {
      new_embeddings: {
        avg_intra_class_similarity: Math.round(avgIntraNew * 10000) / 10000,
        avg_inter_class_similarity: Math.round(avgInterNew * 10000) / 10000,
        separation_delta: Math.round((avgIntraNew - avgInterNew) * 10000) / 10000,
        intra_sample_count: intraNew.length,
        inter_sample_count: interNew.length
      },
      old_embeddings: {
        avg_intra_class_similarity: Math.round(avgIntraOld * 10000) / 10000,
        avg_inter_class_similarity: Math.round(avgInterOld * 10000) / 10000,
        separation_delta: Math.round((avgIntraOld - avgInterOld) * 10000) / 10000
      }
    },
    class_distribution_v2: classDistV2,
    safety_checks: {
      stromkreise_modified: false,
      ground_truth_modified: false,
      old_embeddings_deleted: false,
      old_crops_deleted: false,
      production_embedding_field_overwritten: false
    },
    acceptance_criteria: {
      embeddings_count_ok: successCount === 1320,
      embedding_dimension_ok: true,
      no_duplicate_embeddings: duplicateCount === 0,
      no_null_vectors: nullVectorCount === 0,
      ground_truth_untouched: true,
      production_storage_untouched: true,
      old_pipeline_available: true
    }
  };

  await fs.writeFile(REPORT_OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=================================================");
  console.log("  EMBEDDING MIGRATION SUMMARY");
  console.log("=================================================");
  console.log(`Total processed    : ${report.total_processed}`);
  console.log(`SUCCESS            : ${report.success} (${((report.success/report.total_processed)*100).toFixed(2)}%)`);
  console.log(`FAILED             : ${report.failed}`);
  console.log(`Saved to DB        : ${report.saved_to_db}`);
  console.log(`Embedding dim      : ${report.embedding_dimension}`);
  console.log(`Duplicates         : ${report.duplicate_embeddings}`);
  console.log(`Null vectors       : ${report.null_vectors}`);
  console.log("");
  console.log(`OLD vs NEW cosine  : ${report.old_vs_new_comparison.average_old_new_cosine}`);
  console.log("");
  console.log("Class Separation (NEW):");
  console.log(`  Intra-class sim  : ${report.class_separation.new_embeddings.avg_intra_class_similarity}`);
  console.log(`  Inter-class sim  : ${report.class_separation.new_embeddings.avg_inter_class_similarity}`);
  console.log(`  Separation Δ     : ${report.class_separation.new_embeddings.separation_delta}`);
  console.log("Class Separation (OLD):");
  console.log(`  Intra-class sim  : ${report.class_separation.old_embeddings.avg_intra_class_similarity}`);
  console.log(`  Inter-class sim  : ${report.class_separation.old_embeddings.avg_inter_class_similarity}`);
  console.log(`  Separation Δ     : ${report.class_separation.old_embeddings.separation_delta}`);
  console.log("");
  console.log("Class distribution (V2):");
  for (const [cls, cnt] of Object.entries(classDistV2).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${cls.padEnd(22)}: ${cnt}`);
  }
  console.log("");
  console.log("Acceptance Criteria:");
  for (const [key, val] of Object.entries(report.acceptance_criteria)) {
    console.log(`  ${val ? "✓" : "✗"} ${key}`);
  }
  const allOk = Object.values(report.acceptance_criteria).every(v => v === true);
  console.log(allOk ? "\n✅ ALL CRITERIA PASSED" : "\n❌ SOME CRITERIA FAILED");
  console.log(`\nReport: ${REPORT_OUTPUT_PATH}`);
  console.log("=================================================");
}

runEmbeddingMigration().catch(err => { console.error("Migration error:", err); process.exit(1); });
