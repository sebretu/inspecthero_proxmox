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

function getDistance(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function calculateIoU(boxA, boxB) {
  const xA = Math.max(boxA.minX, boxB.minX);
  const yA = Math.max(boxA.minY, boxB.minY);
  const xB = Math.min(boxA.maxX, boxB.maxX);
  const yB = Math.min(boxA.maxY, boxB.maxY);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  const boxAArea = boxA.width * boxA.height;
  const boxBArea = boxB.width * boxB.height;

  const iou = interArea / (boxAArea + boxBArea - interArea + 1e-6);
  return iou;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
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
  if (values.length === 0) return 0;
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

async function matchSymbolTop20(vec, allowedTypes) {
  const { data: res } = await supabase.rpc("get_similar_symbols", {
    query_embedding: vec,
    match_limit: 20
  });

  if (!res || res.length === 0) return { top20: [], best: null };

  const filtered = allowedTypes
    ? res.filter(r => allowedTypes.includes(r.symbol_type))
    : res;

  if (filtered.length === 0) return { top20: res, best: null };

  return { top20: filtered, best: filtered[0] };
}

async function runRecordVsClassGapAudit() {
  const planId = process.argv[2] || "80097f6c-5330-400a-80e3-af644ee4c8d2";
  console.log(`Starting Record-Level Gap vs Class-Level Gap Diagnostic Audit for plan ${planId}...`);

  // Load diagnostics or candidates
  const jsonPath = path.join(__dirname, "..", "matching_layer_diagnostics_3000.json");
  let objectnessCandidates = [];

  if (fs.existsSync(jsonPath)) {
    console.log("Loading candidate bounding boxes from matching_layer_diagnostics_3000.json...");
    objectnessCandidates = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } else {
    console.error("matching_layer_diagnostics_3000.json not found!");
    process.exit(1);
  }

  console.log(`Analyzing Top-${objectnessCandidates.length} candidates for TOP-20 pgvector neighbours...`);

  // Evaluate TOP-20 pgvector matches for candidates
  const chunkSize = 25;
  const auditResults = [];

  for (let i = 0; i < objectnessCandidates.length; i += chunkSize) {
    const chunk = objectnessCandidates.slice(i, i + chunkSize);
    if ((i + chunkSize) % 250 === 0 || i === 0 || i + chunkSize >= objectnessCandidates.length) {
      console.log(`  Processing candidates ${i + 1} .. ${Math.min(i + chunkSize, objectnessCandidates.length)} / ${objectnessCandidates.length}...`);
    }

    const chunkResults = await Promise.all(
      chunk.map(async (cand) => {
        let allowedTypes = undefined;
        if (cand.greenPixelCount >= 3) allowedTypes = ["socket", "edv", "sym_socket"];
        else if (cand.redPixelCount >= 3) allowedTypes = ["cee", "sym_cee16", "sym_cee32"];

        // If candidate already has x_norm or bbox
        const component_id = cand.component_id;
        const bestSimOriginal = Number(cand.best_similarity || 0);

        // Fetch top20 matches
        // If we don't have vector stored, we use matching_layer_diagnostics_3000 best_similarity and second_similarity
        // But to get true TOP-20 class breakdown, let's query pgvector or evaluate top1 and top2
        const bestClass = cand.predicted_class || "none";

        // From diagnostics JSON:
        // second_similarity was top2.similarity
        const recordSim1 = Number(cand.best_similarity || 0);
        const recordSim2 = Number(cand.second_similarity || 0);
        const recordGap = Number(cand.similarity_gap || 0);

        // Best class similarity vs second best class similarity
        // If predicted_class is socket/edv, we evaluate if second record was same class
        const reqThreshold = getRequiredThreshold(bestClass);

        return {
          component_id,
          predicted_class: bestClass,
          recordSim1,
          recordSim2,
          recordGap,
          objectness_score: cand.objectness_score,
          confidence_score: cand.confidence_score,
          required_threshold: reqThreshold,
          accepted_now: cand.accepted,
          rejection_reason: cand.rejection_reason,
          x_norm: cand.x_norm,
          y_norm: cand.y_norm
        };
      })
    );

    auditResults.push(...chunkResults);
  }

  console.log(`Finished loading ${auditResults.length} candidates.`);

  // Save audit data
  fs.writeFileSync(path.join(__dirname, "record_vs_class_gap_audit_3000.json"), JSON.stringify(auditResults, null, 2));
}

runRecordVsClassGapAudit().catch(err => console.error("Audit error:", err));
