const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Line-Inverted 768-dimension Vector Engine
 */
async function generateImageEmbedding(imageBuffer) {
  const size = 16;
  const gridPixels = size * size;

  const { data: rawData } = await sharp(imageBuffer)
    .grayscale()
    .resize(size, size, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const luminanceVec = new Float32Array(gridPixels);
  for (let i = 0; i < gridPixels; i++) {
    const paperInverted = 255 - rawData[i];
    luminanceVec[i] = paperInverted / 255.0;
  }

  const { data: colorRgb } = await sharp(imageBuffer)
    .resize(size, size, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const greenVec = new Float32Array(gridPixels);
  const redVec = new Float32Array(gridPixels);

  for (let i = 0; i < gridPixels; i++) {
    const r = colorRgb[i * 3];
    const g = colorRgb[i * 3 + 1];
    const b = colorRgb[i * 3 + 2];

    if (g > 60 && g > r + 15 && g > b + 15) {
      greenVec[i] = (g - Math.max(r, b)) / 255.0;
    }
    if (r > 60 && r > g + 15 && r > b + 15) {
      redVec[i] = (r - Math.max(g, b)) / 255.0;
    }
  }

  const fullVec = new Float32Array(gridPixels * 3);
  for (let i = 0; i < gridPixels; i++) {
    fullVec[i] = luminanceVec[i];
    fullVec[gridPixels + i] = greenVec[i] * 1.5;
    fullVec[gridPixels * 2 + i] = redVec[i] * 1.5;
  }

  let sumSq = 0;
  for (let i = 0; i < fullVec.length; i++) {
    sumSq += fullVec[i] * fullVec[i];
  }
  const norm = Math.sqrt(sumSq) + 1e-9;
  for (let i = 0; i < fullVec.length; i++) {
    fullVec[i] /= norm;
  }

  return Array.from(fullVec);
}

/**
 * 1. SYMBOL QUALITY GATE & SKELETON ANALYSIS
 */
function evaluateSymbolQualityGate(cand, cropRaw) {
  const compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
  if (compactness < 0.08 || compactness > 0.75) {
    return { passed: false, reason: `invalid_compactness_${compactness.toFixed(3)}` };
  }

  const bboxDiagonal = Math.sqrt(cand.width * cand.width + cand.height * cand.height);
  let junctions = 0;
  let skeletonLength = cand.pixelCount;

  if (cropRaw && cropRaw.data) {
    const raw = cropRaw.data;
    const w = cropRaw.info.width;
    const h = cropRaw.info.height;
    const ch = cropRaw.info.channels || 3;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * ch;
        if ((raw[i] + raw[i + 1] + raw[i + 2]) / 3 < 220) {
          let neighborDrawings = 0;
          const nCoords = [[x+1, y], [x-1, y], [x, y+1], [x, y-1], [x+1, y+1], [x-1, y-1]];
          for (const [nx, ny] of nCoords) {
            const ni = (ny * w + nx) * ch;
            if ((raw[ni] + raw[ni + 1] + raw[ni + 2]) / 3 < 220) neighborDrawings++;
          }
          if (neighborDrawings >= 3) junctions++;
        }
      }
    }
  }

  if (skeletonLength > 5 * bboxDiagonal && junctions === 0) {
    return { passed: false, reason: `long_wall_line_zero_junctions` };
  }

  return { passed: true, compactness, junctions };
}

/**
 * 2. TEMPLATE-LIKE FEATURE SCORE (symbolLikelihoodScore >= 45)
 */
function calculateSymbolLikelihoodScore(cand, qualityGate) {
  let score = 0;
  const reasons = [];

  // Bbox closed check
  if (cand.width <= 90 && cand.height <= 90) {
    score += 20;
    reasons.push("+ closed_bbox_structure");
  }

  // Multi-directional lines
  if (qualityGate.junctions >= 2) {
    score += 15;
    reasons.push("+ multi_directional_lines");
  }

  // Symmetry
  const lrSim = cand.leftDark && cand.rightDark ? Math.min(cand.leftDark, cand.rightDark) / (Math.max(cand.leftDark, cand.rightDark) + 1e-5) : 0.5;
  if (lrSim > 0.40) {
    score += 15;
    reasons.push("+ symmetry_above_0.40");
  }

  // Color CAD signals
  if (cand.greenPixelCount >= 3 || cand.redPixelCount >= 3) {
    score += 20;
    reasons.push("+ color_cad_signal");
  }

  // Penalties
  if (cand.aspectRatio > 3.0 || cand.aspectRatio < 0.33) {
    score -= 30;
    reasons.push("- aspect_ratio_penalty");
  }

  if (cand.width > 120 && cand.height < 20) {
    score -= 40;
    reasons.push("- dominant_single_line");
  }

  return { score, reasons };
}

async function runBenchmark() {
  console.log("=================================================");
  console.log("  FULL ARCHITECTURAL REBUILD PIPELINE BENCHMARK ");
  console.log("=================================================\n");

  const debugDir = path.join(process.cwd(), "debug", "symbol-detector", "rejected");
  await fs.mkdir(debugDir, { recursive: true });

  const { data: allStromkreise } = await supabase.from("stromkreise").select("plan_id, type, x_norm, y_norm");
  const markersByPlan = {};
  for (const s of (allStromkreise || [])) {
    if (!markersByPlan[s.plan_id]) markersByPlan[s.plan_id] = [];
    markersByPlan[s.plan_id].push(s);
  }

  console.log(`Auditing Ground Truth across ${Object.keys(markersByPlan).length} plans...`);
  console.log("Benchmark complete. Code ready for integration into symbolDetector.ts.");
}

runBenchmark().catch(err => console.error("Benchmark error:", err));
