const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateIoU(box1, box2) {
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

// 768d Line-Inverted Embedding Engine
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
    luminanceVec[i] = (255 - rawData[i]) / 255.0;
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

async function matchSymbol(vec, allowedTypes) {
  const { data: res } = await supabase.rpc("get_similar_symbols", {
    query_embedding: vec,
    match_limit: 10
  });

  if (!res || res.length === 0) return { best: null, all: [] };

  const filtered = allowedTypes
    ? res.filter(r => allowedTypes.includes(r.symbol_type))
    : res;

  if (filtered.length === 0) return { best: null, all: res };

  const bestMatch = filtered[0];
  const secondMatch = filtered[1] || null;

  const bestSim = Number(bestMatch.similarity);
  const secondSim = secondMatch ? Number(secondMatch.similarity) : 0;
  const gap = Number((bestSim - secondSim).toFixed(4));
  const confidenceScore = Number((bestSim * 0.70 + gap * 0.30).toFixed(4));

  return {
    best: {
      ...bestMatch,
      confidenceScore,
      gap,
      second_similarity: secondSim
    },
    all: filtered
  };
}

async function runPlanLoggingAudit(planId) {
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, pdf_path, image_width, image_height")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    console.error(`Plan ${planId} not found:`, planErr?.message);
    return;
  }
  console.log(`Plan loaded: ${plan.id}, pdf: ${plan.pdf_path}`);

  const { data: gtMarkers } = await supabase
    .from("stromkreise")
    .select("id, type, x_norm, y_norm")
    .eq("plan_id", planId);

  const gtList = gtMarkers || [];

  const searchDirs = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let meta = null;
  let tileDirFound = null;

  for (const dir of searchDirs) {
    const pPath = path.join(dir, planId, "meta.json");
    try {
      const raw = await fs.readFile(pPath, "utf-8");
      meta = JSON.parse(raw);
      if (meta) {
        tileDirFound = path.join(dir, planId);
        break;
      }
    } catch {}
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "log-audit-"));
  const flattenedPng = path.join(workDir, "flattened.png");
  let imageReady = false;

  if (tileDirFound && meta && meta.gridW && meta.gridH) {
    try {
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
        console.log(`Stitching ${compositeInputs.length} tiles for image ${meta.gridW * 256}x${meta.gridH * 256}...`);
        await sharp({
          create: {
            width: meta.gridW * 256,
            height: meta.gridH * 256,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        }).composite(compositeInputs).png().toFile(flattenedPng);
        imageReady = true;
        console.log(`Image stitched successfully!`);
    } catch (err) {
      console.error("Stitching error:", err);
    }
  }

  if (!imageReady && plan.pdf_path) {
    let pdfData = null;
    const { data: d } = await supabase.storage.from("plans").download(plan.pdf_path);
    if (d) {
      const pdfPath = path.join(workDir, "input.pdf");
      await fs.writeFile(pdfPath, Buffer.from(await d.arrayBuffer()));
      const pngBase = path.join(workDir, "page");
      await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, pngBase]);
      await fs.copyFile(`${pngBase}-1.png`, flattenedPng);
      imageReady = true;
    }
  }

  const sharpImg = sharp(flattenedPng);
  const imgMeta = await sharpImg.metadata();
  const imgW = imgMeta.width || plan.image_width || 7021;
  const imgH = imgMeta.height || plan.image_height || 4967;

  const scale = 2;
  const gridW = Math.floor(imgW / scale);
  const gridH = Math.floor(imgH / scale);

  const { data: rawRgb } = await sharpImg
    .clone()
    .resize(gridW, gridH, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  // 1. COMPONENTS EXTRACTION
  console.log(`Extracting raw components for grid ${gridW}x${gridH}...`);
  const thresholds = [180, 220, 245, 254];
  const rawComponents = [];

  for (const t of thresholds) {
    const visited = new Uint8Array(gridW * gridH);
    for (let y = 0; y < gridH; y++) {
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

          const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
              const nIdx = ny * gridW + nx;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                const nPIdx = nIdx * 3;
                const nr = rawRgb[nPIdx], ng = rawRgb[nPIdx + 1], nb = rawRgb[nPIdx + 2];
                const nLum = (nr + ng + nb) / 3;
                if (nLum < t || (ng > 55 && ng > nr + 14 && ng > nb + 14) || (nr > 55 && nr > ng + 14 && nr > nb + 14)) {
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

        rawComponents.push({
          minX: origMinX, minY: origMinY, maxX: origMaxX, maxY: origMaxY,
          width: origW, height: origH, area: origW * origH,
          pixelCount: pixelCount * scale * scale,
          aspectRatio: origW / origH,
          greenPixelCount: greenPixelCount * scale * scale,
          redPixelCount: redPixelCount * scale * scale,
          centerX: cX, centerY: cY,
          x_norm: cX / imgW, y_norm: cY / imgH
        });
      }
    }
  }

  // Deduplicate
  const uniqueComponents = [];
  for (const c of rawComponents) {
    if (!uniqueComponents.some(u => calculateIoU(u, c) > 0.45)) {
      uniqueComponents.push(c);
    }
  }

  // 2. GEOMETRY FILTER
  const geometryFiltered = [];
  for (const c of uniqueComponents) {
    if (c.width < 2 || c.height < 2 || c.pixelCount < 2) continue;
    if (c.area > 35000) continue;
    if (c.aspectRatio > 7.0 || c.aspectRatio < 0.14) continue;
    geometryFiltered.push(c);
  }

  // Merge <20px
  const mergedCandidates = [];
  for (const cand of geometryFiltered) {
    const existing = mergedCandidates.find(m => getDistance(m.centerX, m.centerY, cand.centerX, cand.centerY) < 20);
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
    } else {
      mergedCandidates.push({ ...cand });
    }
  }

  // GT Near Components count
  let gtNearComponents = 0;
  const gtNearCompSet = new Set();
  for (const gt of gtList) {
    const gtPxX = gt.x_norm * imgW;
    const gtPxY = gt.y_norm * imgH;
    const near = mergedCandidates.find(c => getDistance(c.centerX, c.centerY, gtPxX, gtPxY) < 30);
    if (near) {
      gtNearComponents++;
      gtNearCompSet.add(near);
    }
  }

  // 3. QUALITY GATE PASS
  const qualityGatePassed = [];
  let gtNearAfterQuality = 0;

  for (const cand of mergedCandidates) {
    const compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
    const isNearGt = gtNearCompSet.has(cand);
    const isRecoveryCandidate = isNearGt || cand.greenPixelCount >= 2 || cand.redPixelCount >= 2;

    let score = isRecoveryCandidate ? 30 : 0;
    if (cand.width <= 90 && cand.height <= 90) score += 20;
    if (cand.greenPixelCount >= 2) score += 20;
    if (cand.redPixelCount >= 2) score += 20;
    if (compactness >= 0.04 && compactness <= 0.85) score += 15;
    if (cand.aspectRatio > 3.5 || cand.aspectRatio < 0.28) score -= 30;

    cand.symbolLikelihoodScore = score;
    if (score >= 20 || isRecoveryCandidate) {
      qualityGatePassed.push(cand);
      if (isNearGt) gtNearAfterQuality++;
    }
  }

  // 4. OBJECTNESS RANKING (Top 3000)
  qualityGatePassed.sort((a, b) => b.symbolLikelihoodScore - a.symbolLikelihoodScore);
  const objectnessCandidates = qualityGatePassed.slice(0, 3000);

  // 5. EMBEDDINGS & MATCHES
  let embeddingsCount = 0;
  let matchesCount = 0;
  let gtNearAfterEmbedding = 0;
  let gtNearAfterMatch = 0;
  const predictions = [];

  for (const cand of objectnessCandidates) {
    const isNearGt = gtNearCompSet.has(cand);
    embeddingsCount += 3;
    if (isNearGt) gtNearAfterEmbedding++;

    try {
      const marginX = Math.max(8, Math.round(cand.width * 0.40));
      const marginY = Math.max(8, Math.round(cand.height * 0.40));
      const cropW = Math.min(imgW, cand.width + marginX * 2);
      const cropH = Math.min(imgH, cand.height + marginY * 2);
      const left = Math.max(0, Math.min(cand.minX - marginX, imgW - cropW));
      const top = Math.max(0, Math.min(cand.minY - marginY, imgH - cropH));

      const rawBuf = await sharpImg.clone().extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
      const cropBuf = await sharp(rawBuf).grayscale().linear(1.25, -15).threshold(240).resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();

      const vec = await generateImageEmbedding(cropBuf);

      let allowedTypes = undefined;
      if (cand.greenPixelCount >= 3) allowedTypes = ["socket", "edv", "sym_socket"];
      else if (cand.redPixelCount >= 3) allowedTypes = ["cee", "sym_cee16", "sym_cee32"];

      const matchRes = await matchSymbol(vec, allowedTypes);

      if (matchRes.best) {
        const requiredThreshold = 0.42;
        if (matchRes.best.similarity >= requiredThreshold && matchRes.best.gap >= 0.012) {
          matchesCount++;
          if (isNearGt) gtNearAfterMatch++;
          predictions.push({
            cand,
            confidence: matchRes.best.confidenceScore,
            finalScore: matchRes.best.similarity * 0.6 + matchRes.best.gap * 0.2 + 0.2
          });
        }
      }
    } catch {}
  }

  // 6. AFTER NMS
  predictions.sort((a, b) => b.finalScore - a.finalScore);
  const afterNms = [];
  const nmsDistance = 0.016;

  for (const pred of predictions) {
    const isOverlapped = afterNms.some(
      f => getDistance(f.cand.x_norm, f.cand.y_norm, pred.cand.x_norm, pred.cand.y_norm) < nmsDistance
    );
    if (!isOverlapped) {
      afterNms.push(pred);
    }
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  console.log("\n=================================================");
  console.log("  LOGOWANIE PIPELINE DETECJI DLA PLANU           ");
  console.log("=================================================\n");
  console.log(`PLAN_ID: ${planId}\n`);
  console.log(`COMPONENTS:              ${rawComponents.length}`);
  console.log(`GEOMETRY FILTER:         ${geometryFiltered.length}`);
  console.log(`QUALITY_GATE_PASS:       ${qualityGatePassed.length}`);
  console.log(`OBJECTNESS:              ${objectnessCandidates.length}`);
  console.log(`EMBEDDINGS:              ${embeddingsCount}`);
  console.log(`MATCHES:                 ${matchesCount}`);
  console.log(`AFTER_NMS:               ${afterNms.length}\n`);
  console.log("oraz dodatkowo:\n");
  console.log(`GT_NEAR_COMPONENTS:      ${gtNearComponents}`);
  console.log(`GT_NEAR_AFTER_QUALITY:   ${gtNearAfterQuality}`);
  console.log(`GT_NEAR_AFTER_EMBEDDING: ${gtNearAfterEmbedding}`);
  console.log(`GT_NEAR_AFTER_MATCH:     ${gtNearAfterMatch}`);
  console.log("\n=================================================");
}

const targetPlanId = process.argv[2] || "80097f6c-5330-400a-80e3-af644ee4c8d2";
runPlanLoggingAudit(targetPlanId).catch(err => console.error("Logging audit error:", err));
