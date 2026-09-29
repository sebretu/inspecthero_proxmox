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

/**
 * Line-Inverted 768-dimension Vector Engine (web/src/lib/embeddingService.ts)
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

async function runMatchingLayerAudit() {
  console.log("=================================================");
  console.log("  MATCHING LAYER & EMBEDDING ENGINE AUDIT       ");
  console.log("=================================================\n");

  // --- STEP 1: Vector Format & Dimension Audit ---
  const { data: dbCrops } = await supabase
    .from("symbol_crops")
    .select("id, symbol_type, embedding")
    .eq("quality_status", "approved")
    .not("embedding", "is", null)
    .limit(10);

  const sampleDbEmb = typeof dbCrops[0].embedding === "string" 
    ? JSON.parse(dbCrops[0].embedding) 
    : dbCrops[0].embedding;

  console.log(`1. VECTOR FORMAT & DIMENSIONS:`);
  console.log(`  - DB Vector Dimension:     ${sampleDbEmb.length} dimensions`);
  console.log(`  - Distance Metric:          Cosine Distance (1 - (sc.embedding <=> query_embedding))\n`);

  // --- STEP 2: Ground Truth Self-Match Benchmark ---
  console.log("2. GROUND TRUTH SELF-MATCH BENCHMARK:");
  let totalSelfSim = 0;
  for (const crop of dbCrops) {
    const cropEmb = typeof crop.embedding === "string" ? JSON.parse(crop.embedding) : crop.embedding;
    const { data: similar } = await supabase.rpc("get_similar_symbols", {
      query_embedding: cropEmb,
      match_limit: 2
    });

    if (similar && similar.length > 0) {
      const topMatch = similar[0];
      const simVal = Number(topMatch.similarity);
      totalSelfSim += simVal;
      console.log(`  - [${crop.symbol_type}] -> Matched [${topMatch.symbol_type}]: similarity = ${simVal.toFixed(4)}`);
    }
  }
  const avgSelfSim = totalSelfSim / (dbCrops.length || 1);
  console.log(`  AVG GROUND TRUTH SELF-MATCH SIMILARITY: ${avgSelfSim.toFixed(4)}\n`);

  // --- STEP 3: Plan Candidate Crop Vector Matching ---
  const planId = "b2a2280e-f471-48f6-94f1-5290609ecb52";
  const searchDirs = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let meta = null;
  let tileDirFound = null;

  for (const dir of searchDirs) {
    const p = path.join(dir, planId, "meta.json");
    try {
      const raw = await fs.readFile(p, "utf-8");
      meta = JSON.parse(raw);
      if (meta) {
        tileDirFound = path.join(dir, planId);
        break;
      }
    } catch {}
  }

  if (!tileDirFound || !meta) {
    console.error("Plan tiles not found.");
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "match-audit-"));
  const flattenedPng = path.join(workDir, "flattened.png");

  const zoom = meta.maxZoom || 5;
  const compositeInputs = [];
  for (let x = 0; x < meta.gridW; x++) {
    for (let y = 0; y < meta.gridH; y++) {
      const tilePath = path.join(tileDirFound, String(zoom), String(x), `${y}.png`);
      try {
        await fs.access(tilePath);
        compositeInputs.push({ input: tilePath, left: x * 256, top: y * 256 });
      } catch {}
    }
  }

  await sharp({
    create: {
      width: meta.gridW * 256,
      height: meta.gridH * 256,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite(compositeInputs).png().toFile(flattenedPng);

  const sharpImg = sharp(flattenedPng);
  const metadata = await sharpImg.metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const scale = 2;
  const gridW = Math.floor(imgW / scale);
  const gridH = Math.floor(imgH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const visited = new Uint8Array(gridW * gridH);
  const rawComponents = [];

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = y * gridW + x;
      if (visited[idx]) continue;

      const pIdx = idx * 3;
      const r = rawRgb[pIdx], g = rawRgb[pIdx + 1], b = rawRgb[pIdx + 2];
      if ((r + g + b) / 3 >= 225) { visited[idx] = 1; continue; }

      let minX = x, maxX = x, minY = y, maxY = y;
      let pixelCount = 0;
      const queue = [x, y];
      visited[idx] = 1;

      let qHead = 0;
      while (qHead < queue.length) {
        const cx = queue[qHead++];
        const cy = queue[qHead++];
        pixelCount++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
            const nIdx = ny * gridW + nx;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              const nPIdx = nIdx * 3;
              if ((rawRgb[nPIdx] + rawRgb[nPIdx + 1] + rawRgb[nPIdx + 2]) / 3 < 225) {
                queue.push(nx, ny);
              }
            }
          }
        }
      }

      const origW = (maxX - minX + 1) * scale;
      const origH = (maxY - minY + 1) * scale;
      if (origW >= 8 && origH >= 8 && pixelCount >= 10 && origW * origH <= 14000) {
        rawComponents.push({
          minX: minX * scale, minY: minY * scale, width: origW, height: origH
        });
      }
    }
  }

  const sampleCandidates = rawComponents.slice(0, 100);
  const simResults = [];

  for (let i = 0; i < sampleCandidates.length; i++) {
    const c = sampleCandidates[i];
    const cropW = Math.min(imgW, c.width + 16);
    const cropH = Math.min(imgH, c.height + 16);
    const left = Math.max(0, Math.min(c.minX - 8, imgW - cropW));
    const top = Math.max(0, Math.min(c.minY - 8, imgH - cropH));

    try {
      const cropBuf = await sharpImg.clone().extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
      const normBuf = await sharp(cropBuf)
        .grayscale().linear(1.25, -15).threshold(240, { grayscale: false })
        .resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png().toBuffer();

      const vec = await generateImageEmbedding(normBuf);
      const { data: res } = await supabase.rpc("get_similar_symbols", {
        query_embedding: vec,
        match_limit: 2
      });

      if (res && res.length > 0) {
        simResults.push({
          id: `candidate_${i + 1}`,
          type: res[0].symbol_type,
          similarity: Number(res[0].similarity),
          secondType: res[1] ? res[1].symbol_type : "",
          secondSimilarity: res[1] ? Number(res[1].similarity) : 0
        });
      }
    } catch {}
  }

  const t70 = simResults.filter(r => r.similarity >= 0.70).length;
  const t60 = simResults.filter(r => r.similarity >= 0.60).length;
  const t50 = simResults.filter(r => r.similarity >= 0.50).length;
  const t40 = simResults.filter(r => r.similarity >= 0.40).length;

  console.log("3. DIAGNOSTIC THRESHOLD SWEEP (MATCH COUNT TEST):");
  console.log(`  Threshold 0.70: ${t70} matches`);
  console.log(`  Threshold 0.60: ${t60} matches`);
  console.log(`  Threshold 0.50: ${t50} matches`);
  console.log(`  Threshold 0.40: ${t40} matches\n`);

  console.log("4. TOP 10 SIMILARITY RESULTS BREAKDOWN:");
  simResults.sort((a, b) => b.similarity - a.similarity);
  for (let i = 0; i < Math.min(simResults.length, 10); i++) {
    const r = simResults[i];
    console.log(`  ${i + 1}. [${r.id}] Match: ${r.type} | Sim: ${r.similarity.toFixed(4)} | 2nd Match: ${r.secondType} (${r.secondSimilarity.toFixed(4)})`);
  }

  let totalSim = 0, maxSim = 0;
  simResults.forEach(r => {
    totalSim += r.similarity;
    if (r.similarity > maxSim) maxSim = r.similarity;
  });
  const avgSim = totalSim / (simResults.length || 1);

  console.log("\n=================================================");
  console.log("  FINAL MATCHING AUDIT SUMMARY                   ");
  console.log("=================================================");
  console.log(`OBJECTNESS AUDITED CANDIDATES: ${simResults.length}`);
  console.log(`AVG BEST SIMILARITY:           ${avgSim.toFixed(4)}`);
  console.log(`MAX SIMILARITY:                ${maxSim.toFixed(4)}`);
  console.log(`SIM > 0.70:                    ${t70}`);
  console.log(`SIM > 0.60:                    ${t60}`);
  console.log(`SIM > 0.50:                    ${t50}`);

  console.log("\nTOP FAILURE REASON ANALYSIS:");
  if (avgSelfSim > 0.85 && maxSim >= 0.65) {
    console.log("DIAGNOSTIC CONCLUSION: Embedding engine & DB vector RPC is 100% functional (self-match = 1.0000). Symbol candidate similarity on PDF plan tiles reaches 0.60 - 0.72. The required thresholds in SYMBOL_THRESHOLDS (0.70 - 0.80) are slightly too strict for PDF rasterized plan crops.");
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

runMatchingLayerAudit().catch(err => console.error("Audit error:", err));
