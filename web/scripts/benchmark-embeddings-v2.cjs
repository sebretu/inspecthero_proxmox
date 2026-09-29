#!/usr/bin/env node
"use strict";

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE env variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const REPORT_OUTPUT_PATH = path.resolve(__dirname, "../embedding_v2_retrieval_benchmark.json");

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

async function runBenchmark() {
  console.log("=================================================");
  console.log("  EMBEDDING V2 RETRIEVAL BENCHMARK");
  console.log("=================================================");

  console.log("Fetching dataset from DB...");
  const records = [];
  let page = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await supabase
      .from("symbol_crops")
      .select("id, stromkreis_id, symbol_type, embedding, metadata")
      .eq("quality_status", "approved")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) throw new Error("Fetch error: " + error.message);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const embOld = parseEmbedding(r.embedding);
      const embV2 = r.metadata?.embedding_v2 ? parseEmbedding(r.metadata.embedding_v2) : null;

      if (embV2 && embOld && r.symbol_type) {
        records.push({
          id: r.id,
          stromkreis_id: r.stromkreis_id,
          symbol_type: r.symbol_type,
          embOld,
          embV2
        });
      }
    }
    page++;
  }

  console.log("Loaded " + records.length + " valid query-gallery items with both OLD and NEW embeddings.");

  const totalQueries = records.length;
  if (totalQueries === 0) {
    throw new Error("No records found for benchmark!");
  }

  const metrics = {
    old: { p1: 0, p5: 0, r10: 0, mrr: 0, falseMatches: 0 },
    new: { p1: 0, p5: 0, r10: 0, mrr: 0, falseMatches: 0 }
  };

  const confusionPairs = [
    ["socket", "edv"],
    ["socket", "sym_socket"],
    ["light", "special"],
    ["cee", "socket"]
  ];

  const confusionOld = {};
  const confusionNew = {};

  for (const [a, b] of confusionPairs) {
    confusionOld[a + "->" + b] = 0;
    confusionOld[b + "->" + a] = 0;
    confusionNew[a + "->" + b] = 0;
    confusionNew[b + "->" + a] = 0;
  }

  const classCounts = {};
  for (const r of records) {
    classCounts[r.symbol_type] = (classCounts[r.symbol_type] || 0) + 1;
  }

  console.log("Running leave-one-out retrieval evaluation for OLD and NEW...");

  for (let i = 0; i < totalQueries; i++) {
    const query = records[i];

    const scoresOld = [];
    const scoresNew = [];

    for (let j = 0; j < totalQueries; j++) {
      if (i === j) continue;
      const candidate = records[j];

      const simOld = cosineSimilarity(query.embOld, candidate.embOld);
      const simNew = cosineSimilarity(query.embV2, candidate.embV2);

      scoresOld.push({ type: candidate.symbol_type, score: simOld });
      scoresNew.push({ type: candidate.symbol_type, score: simNew });
    }

    scoresOld.sort((a, b) => b.score - a.score);
    scoresNew.sort((a, b) => b.score - a.score);

    evalQuery(query.symbol_type, scoresOld, metrics.old, confusionOld, classCounts[query.symbol_type] - 1);
    evalQuery(query.symbol_type, scoresNew, metrics.new, confusionNew, classCounts[query.symbol_type] - 1);
  }

  function evalQuery(queryType, sortedNeighbors, acc, confusionObj, totalSameClassInGallery) {
    const top1 = sortedNeighbors[0];
    const top5 = sortedNeighbors.slice(0, 5);
    const top10 = sortedNeighbors.slice(0, 10);

    if (top1.type === queryType) {
      acc.p1 += 1;
    } else {
      const pairKey = queryType + "->" + top1.type;
      if (confusionObj[pairKey] !== undefined) {
        confusionObj[pairKey] += 1;
      }
      acc.falseMatches += 1;
    }

    const matchesTop5 = top5.filter(n => n.type === queryType).length;
    acc.p5 += matchesTop5 / 5;

    const matchesTop10 = top10.filter(n => n.type === queryType).length;
    acc.r10 += totalSameClassInGallery > 0 ? Math.min(1.0, matchesTop10 / totalSameClassInGallery) : 1.0;

    let rankOfFirstMatch = 0;
    for (let r = 0; r < sortedNeighbors.length; r++) {
      if (sortedNeighbors[r].type === queryType) {
        rankOfFirstMatch = r + 1;
        break;
      }
    }
    acc.mrr += rankOfFirstMatch > 0 ? 1 / rankOfFirstMatch : 0;
  }

  const oldP1 = metrics.old.p1 / totalQueries;
  const newP1 = metrics.new.p1 / totalQueries;

  const oldP5 = metrics.old.p5 / totalQueries;
  const newP5 = metrics.new.p5 / totalQueries;

  const oldR10 = metrics.old.r10 / totalQueries;
  const newR10 = metrics.new.r10 / totalQueries;

  const oldMRR = metrics.old.mrr / totalQueries;
  const newMRR = metrics.new.mrr / totalQueries;

  const oldFMR = metrics.old.falseMatches / totalQueries;
  const newFMR = metrics.new.falseMatches / totalQueries;

  const report = {
    total_queries: totalQueries,

    old_precision_1: Math.round(oldP1 * 10000) / 10000,
    new_precision_1: Math.round(newP1 * 10000) / 10000,

    old_precision_5: Math.round(oldP5 * 10000) / 10000,
    new_precision_5: Math.round(newP5 * 10000) / 10000,

    old_recall_10: Math.round(oldR10 * 10000) / 10000,
    new_recall_10: Math.round(newR10 * 10000) / 10000,

    old_mrr: Math.round(oldMRR * 10000) / 10000,
    new_mrr: Math.round(newMRR * 10000) / 10000,

    old_false_match_rate: Math.round(oldFMR * 10000) / 10000,
    new_false_match_rate: Math.round(newFMR * 10000) / 10000,

    precision_1_delta_pct: Math.round(((newP1 - oldP1) / oldP1) * 10000) / 100,

    confusion_old: confusionOld,
    confusion_new: confusionNew
  };

  await fs.writeFile(REPORT_OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=================================================");
  console.log("  BENCHMARK SUMMARY RESULTS");
  console.log("=================================================");
  console.log("Total Queries Evaluated: " + totalQueries);
  console.log("");
  console.log("Precision@1  | OLD: " + (oldP1 * 100).toFixed(2) + "%  | NEW: " + (newP1 * 100).toFixed(2) + "%  | Delta: +" + report.precision_1_delta_pct + "%");
  console.log("Precision@5  | OLD: " + (oldP5 * 100).toFixed(2) + "%  | NEW: " + (newP5 * 100).toFixed(2) + "%");
  console.log("Recall@10    | OLD: " + (oldR10 * 100).toFixed(2) + "%  | NEW: " + (newR10 * 100).toFixed(2) + "%");
  console.log("MRR          | OLD: " + oldMRR.toFixed(4) + "   | NEW: " + newMRR.toFixed(4));
  console.log("False Match  | OLD: " + (oldFMR * 100).toFixed(2) + "%  | NEW: " + (newFMR * 100).toFixed(2) + "%");
  console.log("");
  console.log("Confusion Matrix (Specific Pairs):");
  console.log("  Pair             | OLD Count | NEW Count | Change");
  for (const key of Object.keys(confusionOld)) {
    const oldC = confusionOld[key];
    const newC = confusionNew[key];
    const diff = newC - oldC;
    const diffStr = diff < 0 ? String(diff) : diff > 0 ? "+" + diff : "0";
    console.log("  " + key.padEnd(16) + " | " + String(oldC).padEnd(9) + " | " + String(newC).padEnd(9) + " | " + diffStr);
  }
  console.log("=================================================");
  console.log("Report JSON saved to: " + REPORT_OUTPUT_PATH);
}

runBenchmark().catch(err => {
  console.error("Benchmark error:", err);
  process.exit(1);
});
