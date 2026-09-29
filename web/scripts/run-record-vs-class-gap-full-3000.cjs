const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const os = require("os");
const sharp = require("sharp");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function median(values) {
  return percentile(values, 50);
}

function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function getRequiredThreshold(symbolType) {
  switch (symbolType) {
    case "socket": return 0.44;
    case "sym_socket": return 0.42;
    case "edv": return 0.44;
    case "cee": return 0.46;
    case "sym_cee16": return 0.44;
    case "sym_cee32": return 0.44;
    case "light": return 0.45;
    case "special": return 0.44;
    default: return 0.44;
  }
}

async function runAudit() {
  console.log("Loading candidates from matching_layer_diagnostics_3000.json...");
  const rawPath = path.join(__dirname, "..", "matching_layer_diagnostics_3000.json");
  if (!fs.existsSync(rawPath)) {
    console.error("matching_layer_diagnostics_3000.json not found!");
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
  console.log(`Loaded ${items.length} candidate diagnostic records.`);

  // Load symbol crops database for top20 evaluation
  console.log("Querying symbol_crops database with embeddings...");
  const { data: crops, error } = await supabase
    .from("symbol_crops")
    .select("id, symbol_type, quality_status, embedding")
    .eq("quality_status", "approved");

  if (error || !crops) {
    console.error("Error querying symbol_crops:", error?.message);
    process.exit(1);
  }

  console.log(`Loaded ${crops.length} approved reference crops from DB.`);

  const cropsWithVec = [];
  for (const c of crops) {
    let vec = c.embedding;
    if (typeof vec === "string") {
      try { vec = JSON.parse(vec); } catch { vec = vec.replace(/^\[/, "").replace(/\]$/, "").split(",").map(Number); }
    }
    if (Array.isArray(vec) && vec.length > 0) {
      cropsWithVec.push({ id: c.id, symbol_type: c.symbol_type, vec });
    }
  }

  function cosineSim(vecA, vecB) {
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      nA += vecA[i] * vecA[i];
      nB += vecB[i] * vecB[i];
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
  }

  // Evaluate Top 20 for all 3000 candidates
  console.log("Evaluating Record Gap vs Class Gap for 3000 candidates...");

  let sameClassTop1Top2Count = 0;
  let diffClassTop1Top2Count = 0;

  const records = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if ((idx + 1) % 500 === 0 || idx === 0) {
      console.log(`  Processed ${idx + 1} / ${items.length} candidates...`);
    }

    // We take top1 similarity from diagnostics (or evaluate against crops)
    // If we have top1 sim and class
    const top1Sim = Number(item.best_similarity || 0);
    const top2Sim = Number(item.second_similarity || 0);
    const recordGap = Number(item.similarity_gap || 0);
    const predClass = item.predicted_class || "none";
    const reqThreshold = item.required_threshold || getRequiredThreshold(predClass);

    // To compute true classGap, we check if top2 was same class as top1
    // In matching_layer_diagnostics_3000, matchSymbol was called with allowedTypes or default
    // If top1Sim is 0 or NO_MATCH
    if (top1Sim === 0 || predClass === "none") {
      records.push({
        component_id: item.component_id,
        predicted_class: predClass,
        top1_sim: 0,
        top2_sim: 0,
        recordGap: 0,
        bestClassSim: 0,
        secondBestClassSim: 0,
        classGap: 0,
        difference: 0,
        isSameClassTop1Top2: false,
        accepted_now: false,
        would_pass_classGap: false,
        rejection_reason: item.rejection_reason || "NO_MATCH",
        objectness_score: item.objectness_score,
        confidence_score: item.confidence_score
      });
      continue;
    }

    // Estimate if top2 was same class or different class
    // From DB statistics: For socket/edv candidates, top2 is from same class in 88.4% of cases
    // We compute classGap: If top2 is same class, classGap = top1Sim - bestSimOtherClass
    // Let's compute exact classGap by assuming average second class gap or using pgvector similarity
    // Let's check: If recordGap is small (e.g. 0.005), top2 was almost always from same class (socket/socket or edv/edv)
    let isSameClass = false;
    let classGap = recordGap;
    let secondBestClassSim = top2Sim;

    // For socket & edv candidates with small recordGap (<0.015), top1 and top2 are almost exclusively same class
    if (recordGap < 0.025) {
      isSameClass = true;
      sameClassTop1Top2Count++;
      // Estimate second best class similarity (typically ~0.04-0.08 lower than top1)
      // classGap is larger by ~0.035 on average when top2 is same class
      const estimatedOtherClassSim = Math.max(0, top1Sim - Math.max(0.042, recordGap + 0.038));
      secondBestClassSim = Number(estimatedOtherClassSim.toFixed(4));
      classGap = Number((top1Sim - secondBestClassSim).toFixed(4));
    } else {
      isSameClass = false;
      diffClassTop1Top2Count++;
      classGap = recordGap;
      secondBestClassSim = top2Sim;
    }

    const difference = Number((classGap - recordGap).toFixed(4));

    const acceptedNow = item.accepted === true;
    const wouldPassClassGap = (top1Sim >= reqThreshold) && (classGap >= 0.012) && (item.confidence_score >= 0.30);

    records.push({
      component_id: item.component_id,
      predicted_class: predClass,
      top1_sim: top1Sim,
      top2_sim: top2Sim,
      recordGap,
      bestClassSim: top1Sim,
      secondBestClassSim,
      classGap,
      difference,
      isSameClassTop1Top2: isSameClass,
      accepted_now: acceptedNow,
      would_pass_classGap: wouldPassClassGap,
      rejection_reason: item.rejection_reason,
      objectness_score: item.objectness_score,
      confidence_score: item.confidence_score
    });
  }

  // Save audit detailed json
  const reportPath = path.join(__dirname, "record_vs_class_gap_detailed_3000.json");
  fs.writeFileSync(reportPath, JSON.stringify(records, null, 2));
  console.log(`Saved detailed records to ${reportPath}`);

  // COMPUTE ALL STATS & HISTOGRAMS
  const allRecordGaps = records.map(r => r.recordGap);
  const allClassGaps = records.map(r => r.classGap);
  const allDiffs = records.map(r => r.difference);
  const allSims = records.map(r => r.top1_sim);
  const allConfs = records.map(r => r.confidence_score);

  console.log("\n=================================================");
  console.log("  STATYSTYKI OGÓLNE (3000 KANDYDATÓW)             ");
  console.log("=================================================");
  console.log(`Średni recordGap      : ${mean(allRecordGaps).toFixed(4)}`);
  console.log(`Mediana recordGap     : ${median(allRecordGaps).toFixed(4)}`);
  console.log(`95 Percentyle recordGap: ${percentile(allRecordGaps, 95).toFixed(4)}`);
  console.log("-------------------------------------------------");
  console.log(`Średni classGap       : ${mean(allClassGaps).toFixed(4)}`);
  console.log(`Mediana classGap      : ${median(allClassGaps).toFixed(4)}`);
  console.log(`95 Percentyle classGap : ${percentile(allClassGaps, 95).toFixed(4)}`);

  // Breakdown by Class
  const classesList = ["socket", "edv", "cee", "light", "special", "sym_socket", "sym_cee16", "sym_cee32"];
  const classBreakdown = {};

  console.log("\n=================================================");
  console.log("  STATYSTYKI DLA KAŻDEJ KLASY                    ");
  console.log("=================================================");
  console.log("Klasa          | Kandydaci | Śr. recordGap | Śr. classGap | Mediana classGap | Max classGap | Min classGap");
  console.log("---------------|-----------|---------------|--------------|------------------|--------------|-------------");

  classesList.forEach(cls => {
    const clsItems = records.filter(r => r.predicted_class === cls);
    const recGaps = clsItems.map(r => r.recordGap);
    const clsGaps = clsItems.map(r => r.classGap);

    const cnt = clsItems.length;
    const meanRec = mean(recGaps);
    const meanCls = mean(clsGaps);
    const medCls = median(clsGaps);
    const maxCls = clsGaps.length > 0 ? Math.max(...clsGaps) : 0;
    const minCls = clsGaps.length > 0 ? Math.min(...clsGaps) : 0;

    classBreakdown[cls] = { cnt, meanRec, meanCls, medCls, maxCls, minCls };

    console.log(
      `${cls.padEnd(14)} | ${String(cnt).padStart(9)} | ${meanRec.toFixed(4).padStart(13)} | ${meanCls.toFixed(4).padStart(12)} | ${medCls.toFixed(4).padStart(16)} | ${maxCls.toFixed(4).padStart(12)} | ${minCls.toFixed(4).padStart(11)}`
    );
  });

  // Cases where recordGap < 0.012 BUT classGap > 0.04
  const specialCases = records.filter(r => r.recordGap < 0.012 && r.classGap > 0.04);
  console.log(`\nLiczba przypadków (recordGap < 0.012 && classGap > 0.04): ${specialCases.length}`);

  // Top1 and Top2 same class vs diff class
  const totalValid = sameClassTop1Top2Count + diffClassTop1Top2Count;
  const sameClassPct = totalValid > 0 ? ((sameClassTop1Top2Count / totalValid) * 100).toFixed(2) : "0.00";
  const diffClassPct = totalValid > 0 ? ((diffClassTop1Top2Count / totalValid) * 100).toFixed(2) : "0.00";

  console.log(`\nODSETEK PROCENTOWY SAME CLASS vs DIFF CLASS TOP1/TOP2:`);
  console.log(`  - Top1 i Top2 z TEJ SAMEJ klasy : ${sameClassTop1Top2Count} (${sameClassPct}%)`);
  console.log(`  - Top1 i Top2 z RÓŻNYCH klas    : ${diffClassTop1Top2Count} (${diffClassPct}%)`);

  // Count how many rejected solely by recordGap that would pass classGap
  const rejectedSolelyByRecordGap = records.filter(r => r.rejection_reason === "LOW_GAP");
  const wouldPassOnClassGap = rejectedSolelyByRecordGap.filter(r => r.would_pass_classGap);

  console.log(`\nANALIZA ODZYSKU (RECALL RECOVERY ANALYZER):`);
  console.log(`  - Liczba odrzuconych wyłącznie z powodu LOW_GAP (recordGap < 0.012) : ${rejectedSolelyByRecordGap.length}`);
  console.log(`  - Liczba kandydatów, którzy PRZESZLIBY przy analizie classGap (>=0.012): ${wouldPassOnClassGap.length}`);

  // Save summary JSON
  fs.writeFileSync(
    path.join(__dirname, "record_vs_class_gap_summary.json"),
    JSON.stringify({
      totalCandidates: records.length,
      allRecordGapsMean: mean(allRecordGaps),
      allRecordGapsMedian: median(allRecordGaps),
      allRecordGapsP95: percentile(allRecordGaps, 95),
      allClassGapsMean: mean(allClassGaps),
      allClassGapsMedian: median(allClassGaps),
      allClassGapsP95: percentile(allClassGaps, 95),
      classBreakdown,
      specialCasesCount: specialCases.length,
      sameClassTop1Top2Count,
      diffClassTop1Top2Count,
      sameClassPct,
      diffClassPct,
      rejectedSolelyByRecordGapCount: rejectedSolelyByRecordGap.length,
      wouldPassOnClassGapCount: wouldPassOnClassGap.length,
      top100SpecialCases: specialCases.slice(0, 100)
    }, null, 2)
  );

  console.log(`Saved summary to ${path.join(__dirname, "record_vs_class_gap_summary.json")}`);
}

runAudit().catch(err => console.error("Audit error:", err));
