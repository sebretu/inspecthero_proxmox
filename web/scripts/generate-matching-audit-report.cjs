const fs = require("fs");
const path = require("path");

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) return sorted[half];
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

function mean(values) {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function generateReport() {
  const jsonPath = path.join(__dirname, "..", "matching_layer_diagnostics_3000.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Diagnostic data file not found:", jsonPath);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${items.length} candidate diagnostic records.`);

  // 1. BEST SIMILARITY HISTOGRAM
  const simBins = [
    { label: "0.00–0.05", min: 0.00, max: 0.05 },
    { label: "0.05–0.10", min: 0.05, max: 0.10 },
    { label: "0.10–0.15", min: 0.10, max: 0.15 },
    { label: "0.15–0.20", min: 0.15, max: 0.20 },
    { label: "0.20–0.25", min: 0.20, max: 0.25 },
    { label: "0.25–0.30", min: 0.25, max: 0.30 },
    { label: "0.30–0.35", min: 0.30, max: 0.35 },
    { label: "0.35–0.40", min: 0.35, max: 0.40 },
    { label: "0.40–0.45", min: 0.40, max: 0.45 },
    { label: "0.45–0.50", min: 0.45, max: 0.50 },
    { label: "0.50–0.55", min: 0.50, max: 0.55 },
    { label: "0.55–0.60", min: 0.55, max: 0.60 },
    { label: "0.60–0.65", min: 0.60, max: 0.65 },
    { label: "0.65–0.70", min: 0.65, max: 0.70 },
    { label: "0.70–0.75", min: 0.70, max: 0.75 },
    { label: "0.75+",     min: 0.75, max: 1.01 }
  ];

  const simHist = simBins.map(b => ({
    ...b,
    count: items.filter(i => i.best_similarity >= b.min && (b.max === 1.01 ? i.best_similarity >= b.min : i.best_similarity < b.max)).length
  }));

  // 2. CONFIDENCE SCORE HISTOGRAM
  const confHist = simBins.map(b => ({
    ...b,
    count: items.filter(i => i.confidence_score >= b.min && (b.max === 1.01 ? i.confidence_score >= b.min : i.confidence_score < b.max)).length
  }));

  // 3. SIMILARITY GAP HISTOGRAM
  const gapBins = [
    { label: "0.000–0.005", min: 0.000, max: 0.005 },
    { label: "0.005–0.010", min: 0.005, max: 0.010 },
    { label: "0.010–0.015", min: 0.010, max: 0.015 },
    { label: "0.015–0.020", min: 0.015, max: 0.020 },
    { label: "0.020–0.030", min: 0.020, max: 0.030 },
    { label: "0.030–0.050", min: 0.030, max: 0.050 },
    { label: ">0.050",       min: 0.050, max: 1.000 }
  ];

  const gapHist = gapBins.map(b => ({
    ...b,
    count: items.filter(i => i.similarity_gap >= b.min && (b.max === 1.000 ? i.similarity_gap >= b.min : i.similarity_gap < b.max)).length
  }));

  // 4. REJECTIONS BY REASON
  const reasonKeys = [
    "LOW_SIMILARITY",
    "LOW_GAP",
    "LOW_CONFIDENCE",
    "CLASS_FILTER",
    "NO_MATCH",
    "NMS_REMOVED",
    "OTHER"
  ];

  const rejectionCounts = {};
  reasonKeys.forEach(k => rejectionCounts[k] = 0);

  let acceptedCount = 0;
  items.forEach(i => {
    if (i.accepted) {
      acceptedCount++;
    } else {
      const reason = i.rejection_reason || "OTHER";
      if (rejectionCounts[reason] !== undefined) {
        rejectionCounts[reason]++;
      } else {
        rejectionCounts["OTHER"]++;
      }
    }
  });

  const totalCount = items.length;
  const totalRejected = totalCount - acceptedCount;

  // 5. CLASS STATISTICS
  const targetClasses = [
    "socket",
    "sym_socket",
    "edv",
    "cee",
    "sym_cee16",
    "sym_cee32",
    "light",
    "special"
  ];

  const classStats = targetClasses.map(cls => {
    const clsItems = items.filter(i => i.predicted_class === cls);
    const sims = clsItems.map(i => Number(i.best_similarity)).filter(x => !isNaN(x) && isFinite(x));
    const gaps = clsItems.map(i => Number(i.similarity_gap)).filter(x => !isNaN(x) && isFinite(x));
    const acceptedInCls = clsItems.filter(i => i.accepted).length;

    return {
      className: cls,
      count: clsItems.length,
      meanSim: mean(sims),
      medianSim: median(sims),
      maxSim: sims.length > 0 ? Math.max(...sims) : 0,
      minSim: sims.length > 0 ? Math.min(...sims) : 0,
      meanGap: mean(gaps),
      acceptedCount: acceptedInCls
    };
  });

  // 6. TOP 100 BEST CANDIDATES (sorted by best_similarity desc)
  const sortedBySim = [...items].sort((a, b) => b.best_similarity - a.best_similarity);
  const top100Best = sortedBySim.slice(0, 100);

  // 7. TOP 100 REJECTED JUST BELOW THRESHOLD (sorted by best_similarity desc)
  const rejectedItems = items.filter(i => !i.accepted);
  rejectedItems.sort((a, b) => b.best_similarity - a.best_similarity);
  const top100RejectedBelowThreshold = rejectedItems.slice(0, 100);

  // OUTPUT REPORT TO CONSOLE
  console.log("\n=================================================");
  console.log("  HISTOGRAM bestSimilarity                       ");
  console.log("=================================================");
  simHist.forEach(h => {
    const pct = ((h.count / totalCount) * 100).toFixed(2);
    console.log(`${h.label.padEnd(12)}: ${String(h.count).padStart(6)} (${pct}%)`);
  });

  console.log("\n=================================================");
  console.log("  HISTOGRAM confidence_score                     ");
  console.log("=================================================");
  confHist.forEach(h => {
    const pct = ((h.count / totalCount) * 100).toFixed(2);
    console.log(`${h.label.padEnd(12)}: ${String(h.count).padStart(6)} (${pct}%)`);
  });

  console.log("\n=================================================");
  console.log("  HISTOGRAM similarity_gap                       ");
  console.log("=================================================");
  gapHist.forEach(h => {
    const pct = ((h.count / totalCount) * 100).toFixed(2);
    console.log(`${h.label.padEnd(12)}: ${String(h.count).padStart(6)} (${pct}%)`);
  });

  console.log("\n=================================================");
  console.log("  ODRDUCZENIA WEDŁUG PRZYCZYNY                    ");
  console.log("=================================================");
  reasonKeys.forEach(k => {
    const cnt = rejectionCounts[k];
    const pctOfTotal = ((cnt / totalCount) * 100).toFixed(2);
    const pctOfRejections = totalRejected > 0 ? ((cnt / totalRejected) * 100).toFixed(2) : "0.00";
    console.log(`${k.padEnd(16)}: ${String(cnt).padStart(6)} (${pctOfTotal}% wszystkich | ${pctOfRejections}% odrzuceń)`);
  });
  console.log(`AKCEPTACJE (FINAL): ${acceptedCount} (${((acceptedCount / totalCount) * 100).toFixed(2)}%)`);

  console.log("\n=================================================");
  console.log("  STATYSTYKI DLA KAŻDEJ KLASY                     ");
  console.log("=================================================");
  console.log("Klasa          | Kandydaci | Śr. Sim | Med. Sim | Max Sim | Min Sim | Śr. Gap | Zaakceptowano");
  console.log("---------------|-----------|---------|----------|---------|---------|---------|--------------");
  classStats.forEach(s => {
    console.log(
      `${s.className.padEnd(14)} | ${String(s.count).padStart(9)} | ${s.meanSim.toFixed(4)}  | ${s.medianSim.toFixed(4)}   | ${s.maxSim.toFixed(4)}  | ${s.minSim.toFixed(4)}  | ${s.meanGap.toFixed(4)}  | ${String(s.acceptedCount).padStart(12)}`
    );
  });

  console.log("\n=================================================");
  console.log("  TOP 10 BEST CANDIDATES (SAMPLE FROM TOP 100)  ");
  console.log("=================================================");
  top100Best.slice(0, 10).forEach((c, idx) => {
    console.log(`${idx + 1}. ID: ${c.component_id} | Class: ${c.predicted_class} | Sim: ${c.best_similarity} | Gap: ${c.similarity_gap} | Conf: ${c.confidence_score} | Accepted: ${c.accepted} | Reason: ${c.rejection_reason}`);
  });

  console.log("\n=================================================");
  console.log("  TOP 10 REJECTED JUST BELOW THRESHOLD (SAMPLE)  ");
  console.log("=================================================");
  top100RejectedBelowThreshold.slice(0, 10).forEach((c, idx) => {
    console.log(`${idx + 1}. ID: ${c.component_id} | Class: ${c.predicted_class} | Sim: ${c.best_similarity} | Gap: ${c.similarity_gap} | Conf: ${c.confidence_score} | Reason: ${c.rejection_reason}`);
  });

  // Save report data to JSON for quick markdown generation
  const summaryJsonPath = path.join(__dirname, "matching_audit_summary_3000.json");
  fs.writeFileSync(summaryJsonPath, JSON.stringify({
    simHist,
    confHist,
    gapHist,
    rejectionCounts,
    acceptedCount,
    totalCount,
    classStats,
    top100Best,
    top100RejectedBelowThreshold
  }, null, 2));

  console.log(`\nSummary JSON saved to ${summaryJsonPath}`);
}

generateReport();
