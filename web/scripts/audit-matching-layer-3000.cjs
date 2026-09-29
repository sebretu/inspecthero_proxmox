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

function getRequiredThreshold(symbolType) {
  switch (symbolType) {
    case "socket":
    case "sym_socket":
      return 0.42;
    case "edv":
      return 0.42;
    case "cee":
    case "sym_cee16":
    case "sym_cee32":
      return 0.44;
    case "light":
      return 0.52;
    case "special":
      return 0.50;
    default:
      return 0.42;
  }
}

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

async function runMatchingLayerAudit(planId) {
  console.log(`Starting MATCHING Layer Diagnostic Audit for plan ${planId}...`);

  const { data: plan } = await supabase
    .from("plans")
    .select("id, pdf_path, image_width, image_height")
    .eq("id", planId)
    .single();

  if (!plan) {
    console.error(`Plan ${planId} not found`);
    process.exit(1);
  }

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

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "matching-audit-"));
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
      if (compositeInputs.length > 0) {
        await sharp({
          create: {
            width: meta.gridW * 256,
            height: meta.gridH * 256,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          }
        }).composite(compositeInputs).png().toFile(flattenedPng);
        imageReady = true;
      }
    } catch {}
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
          id: `comp_${rawComponents.length + 1}`,
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

  // 3. QUALITY GATE
  const qualityGatePassed = [];
  for (const cand of mergedCandidates) {
    const compactness = cand.pixelCount / (cand.width * cand.height + 1e-5);
    const isRecoveryCandidate = cand.greenPixelCount >= 2 || cand.redPixelCount >= 2;

    let score = isRecoveryCandidate ? 30 : 0;
    if (cand.width <= 90 && cand.height <= 90) score += 20;
    if (cand.greenPixelCount >= 2) score += 20;
    if (cand.redPixelCount >= 2) score += 20;
    if (compactness >= 0.04 && compactness <= 0.85) score += 15;
    if (cand.aspectRatio > 3.5 || cand.aspectRatio < 0.28) score -= 30;

    cand.symbolLikelihoodScore = score;
    if (score >= 20 || isRecoveryCandidate) {
      qualityGatePassed.push(cand);
    }
  }

  // 4. OBJECTNESS TOP-3000
  qualityGatePassed.sort((a, b) => b.symbolLikelihoodScore - a.symbolLikelihoodScore);
  const objectnessCandidates = qualityGatePassed.slice(0, 3000);

  console.log(`Processing MATCHING Layer diagnostics for ${objectnessCandidates.length} candidates in parallel chunks...`);

  // Diagnostics Data for ALL 3000 candidates
  const diagnostics = [];
  const minGapRequired = 0.012;

  const chunkSize = 25;
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

        const paddings = [
          { name: "A", val: 0.20 },
          { name: "B", val: 0.40 },
          { name: "C", val: 0.80 }
        ];

        const patchResults = [];

        for (const p of paddings) {
          try {
            const marginX = Math.max(8, Math.round(cand.width * p.val));
            const marginY = Math.max(8, Math.round(cand.height * p.val));
            const cropW = Math.min(imgW, cand.width + marginX * 2);
            const cropH = Math.min(imgH, cand.height + marginY * 2);
            const left = Math.max(0, Math.min(cand.minX - marginX, imgW - cropW));
            const top = Math.max(0, Math.min(cand.minY - marginY, imgH - cropH));

            const rawBuf = await sharpImg.clone().extract({ left, top, width: cropW, height: cropH }).png().toBuffer();
            const cropBuf = await sharp(rawBuf).grayscale().linear(1.25, -15).threshold(240).resize(256, 256, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer();

            const vec = await generateImageEmbedding(cropBuf);
            const matchRes = await matchSymbol(vec, allowedTypes);
            patchResults.push({ name: p.name, matchRes, vec });
          } catch (err) {
            patchResults.push({ name: p.name, matchRes: { best: null, all: [] }, vec: null });
          }
        }

        patchResults.sort((x, y) => {
          const simX = x.matchRes.best ? x.matchRes.best.similarity : 0;
          const simY = y.matchRes.best ? y.matchRes.best.similarity : 0;
          return simY - simX;
        });

        const bestPatch = patchResults[0];
        const matchRes = bestPatch.matchRes;

        if (!matchRes.best) {
          return {
            component_id: cand.id,
            bbox: { minX: cand.minX, minY: cand.minY, width: cand.width, height: cand.height },
            objectness_score: cand.symbolLikelihoodScore,
            embedding_patch: bestPatch.name,
            predicted_class: "none",
            best_similarity: 0,
            second_similarity: 0,
            similarity_gap: 0,
            confidence_score: 0,
            required_threshold: 0.42,
            accepted: false,
            rejection_reason: "NO_MATCH",
            x_norm: cand.x_norm,
            y_norm: cand.y_norm
          };
        }

        const bestMatch = matchRes.best;
        const predictedType = bestMatch.symbol_type;
        const bestSim = Number(parseFloat(bestMatch.similarity).toFixed(4));
        const secondSim = Number(parseFloat(bestMatch.second_similarity || 0).toFixed(4));
        const gap = Number(parseFloat(bestMatch.gap || 0).toFixed(4));
        const confScore = Number(parseFloat(bestMatch.confidenceScore || 0).toFixed(4));
        const reqThreshold = getRequiredThreshold(predictedType);

        const isColorless = cand.greenPixelCount < 3 && cand.redPixelCount < 3;

        let accepted = false;
        let rejectionReason = "OTHER";

        if (isColorless && (predictedType === "light" || predictedType === "special") && bestSim < 0.52) {
          accepted = false;
          rejectionReason = "CLASS_FILTER";
        } else if (bestSim < reqThreshold) {
          accepted = false;
          rejectionReason = "LOW_SIMILARITY";
        } else if (gap < minGapRequired) {
          accepted = false;
          rejectionReason = "LOW_GAP";
        } else if (confScore < 0.30) {
          accepted = false;
          rejectionReason = "LOW_CONFIDENCE";
        } else {
          accepted = true;
          rejectionReason = "NONE";
        }

        return {
          component_id: cand.id,
          bbox: { minX: Math.round(cand.minX), minY: Math.round(cand.minY), width: Math.round(cand.width), height: Math.round(cand.height) },
          objectness_score: cand.symbolLikelihoodScore,
          embedding_patch: bestPatch.name,
          predicted_class: predictedType,
          best_similarity: bestSim,
          second_similarity: secondSim,
          similarity_gap: gap,
          confidence_score: confScore,
          required_threshold: reqThreshold,
          accepted,
          rejection_reason: rejectionReason,
          final_score: bestSim * 0.6 + gap * 0.2 + 0.2,
          x_norm: cand.x_norm,
          y_norm: cand.y_norm
        };
      })
    );

    diagnostics.push(...chunkResults);
  }

  // Evaluate NMS for accepted candidates
  const acceptedCandidates = diagnostics.filter(d => d.accepted);
  acceptedCandidates.sort((a, b) => b.final_score - a.final_score);

  const nmsPassed = [];
  const nmsDistance = 0.016;

  for (const item of acceptedCandidates) {
    const isOverlapped = nmsPassed.some(
      f => getDistance(f.x_norm, f.y_norm, item.x_norm, item.y_norm) < nmsDistance
    );
    if (isOverlapped) {
      item.accepted = false;
      item.rejection_reason = "NMS_REMOVED";
    } else {
      nmsPassed.push(item);
    }
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  // Save diagnostic json
  const reportJsonPath = path.join(process.cwd(), "matching_layer_diagnostics_3000.json");
  await fs.writeFile(reportJsonPath, JSON.stringify(diagnostics, null, 2));

  console.log(`Diagnostic data saved to ${reportJsonPath}`);
}

const targetPlanId = process.argv[2] || "80097f6c-5330-400a-80e3-af644ee4c8d2";
runMatchingLayerAudit(targetPlanId).catch(err => console.error("Audit error:", err));
