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
 * Advanced CAD Symbol Objectness Score:
 * Symmetry, Inner Component Sub-structures, Skeleton Complexity (Junctions), Linearity Penalty.
 */
function calculateSymbolScore(c, cropRaw) {
  let score = 0;
  const reasons = [];

  // 1. Compactness
  if (c.width <= 100 && c.height <= 100) {
    score += 20;
    reasons.push("+ compact_geometry");
  }

  // 2. Aspect Ratio
  if (c.aspectRatio >= 0.55 && c.aspectRatio <= 1.85) {
    score += 20;
    reasons.push("+ balanced_aspect_ratio");
  } else if (c.aspectRatio > 4.5 || c.aspectRatio < 0.22) {
    score -= 50;
    reasons.push("- elongated_strip");
  }

  // 3. Pixel Density
  if (c.pixelCount >= 40 && c.pixelCount <= 2800) {
    score += 20;
    reasons.push("+ ideal_cad_density");
  } else if (c.pixelCount < 30) {
    score -= 20;
    reasons.push("- too_few_pixels");
  } else if (c.pixelCount > 3500) {
    score -= 20;
    reasons.push("- excessive_density");
  }

  // 4. Color Signals & Bypass
  if (c.greenPixelCount >= 3) {
    score += 20;
    reasons.push("+ green_cad_pixels");
  }
  if (c.redPixelCount >= 3) {
    score += 20;
    reasons.push("+ red_cad_pixels");
  }

  // Green CAD Compact Bypass
  if (c.greenPixelCount >= 5 && c.width <= 100 && c.height <= 100) {
    score += 30;
    reasons.push("+ green_cad_compact_bypass");
  }

  // 5. Symmetry Analysis (Left/Right & Top/Bottom)
  if (cropRaw && cropRaw.data) {
    const raw = cropRaw.data;
    const w = cropRaw.info.width;
    const h = cropRaw.info.height;
    const ch = cropRaw.info.channels || 3;

    let leftDark = 0, rightDark = 0;
    let topDark = 0, bottomDark = 0;
    let junctions = 0;

    const midX = Math.floor(w / 2);
    const midY = Math.floor(h / 2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * ch;
        const lum = (raw[i] + raw[i + 1] + raw[i + 2]) / 3;

        if (lum < 220) {
          if (x < midX) leftDark++; else rightDark++;
          if (y < midY) topDark++; else bottomDark++;

          // Skeleton Junction approximation: count drawing neighbors
          if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
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

    const lrSim = Math.min(leftDark, rightDark) / (Math.max(leftDark, rightDark) + 1e-5);
    const tbSim = Math.min(topDark, bottomDark) / (Math.max(topDark, bottomDark) + 1e-5);
    const symmetry = (lrSim + tbSim) / 2;

    if (symmetry > 0.60) {
      score += 15;
      reasons.push("+ high_object_symmetry");
    }

    if (junctions >= 2) {
      score += 15;
      reasons.push("+ skeleton_junctions_detected");
    }
  }

  // 6. Wall & Linearity Penalties
  if (c.width > 120 && c.height < 22) {
    score -= 60;
    reasons.push("- horizontal_wall_penalty");
  }
  if (c.height > 120 && c.width < 22) {
    score -= 60;
    reasons.push("- vertical_wall_penalty");
  }

  return { score, reasons };
}

async function extractSymbolCandidates(imagePath) {
  const sharpImg = sharp(imagePath);
  const metadata = await sharpImg.metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const scale = 3;
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
      const lum = (r + g + b) / 3;

      const isDrawing = lum < 225;
      const isGreen = g > 60 && g > r + 18 && g > b + 18;

      if (!isDrawing && !isGreen) {
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
        if (cg > 60 && cg > cr + 18 && cg > cb + 18) greenPixelCount++;
        if (cr > 60 && cr > cg + 18 && cr > cb + 18) redPixelCount++;

        const neighbors = [
          [cx + 1, cy], [cx - 1, cy],
          [cx, cy + 1], [cx, cy - 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
            const nIdx = ny * gridW + nx;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              const nPIdx = nIdx * 3;
              const nr = rawRgb[nPIdx], ng = rawRgb[nPIdx + 1], nb = rawRgb[nPIdx + 2];
              const nLum = (nr + ng + nb) / 3;
              const nIsDrawing = nLum < 225;
              const nIsGreen = ng > 60 && ng > nr + 18 && ng > nb + 18;

              if (nIsDrawing || nIsGreen) {
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

      rawComponents.push({
        minX: origMinX,
        minY: origMinY,
        maxX: origMaxX,
        maxY: origMaxY,
        width: origW,
        height: origH,
        area: origW * origH,
        pixelCount: pixelCount * scale * scale,
        aspectRatio: origW / origH,
        fillRatio: (pixelCount * scale * scale) / (origW * origH + 1e-5),
        greenPixelCount: greenPixelCount * scale * scale,
        redPixelCount: redPixelCount * scale * scale,
        centerX: (origMinX + origMaxX) / 2,
        centerY: (origMinY + origMaxY) / 2
      });
    }
  }

  const geometryFiltered = [];
  for (const c of rawComponents) {
    if (c.width < 12 || c.height < 12 || c.pixelCount < 30) continue;
    if (c.area > 12000 || (c.width > 120 && c.height > 120)) continue;
    if (c.aspectRatio > 4.5 || c.aspectRatio < 0.22) continue;
    geometryFiltered.push(c);
  }

  const mergedCandidates = [];
  const mergeRadius = 20;

  for (const cand of geometryFiltered) {
    const existing = mergedCandidates.find(
      m => getDistance(m.centerX, m.centerY, cand.centerX, cand.centerY) < mergeRadius
    );

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

  // Calculate Symbol Objectness Score
  const scoredCandidates = mergedCandidates.map((c, idx) => {
    const { score, reasons } = calculateSymbolScore(c, null);
    return {
      id: `component_${String(idx + 1).padStart(3, "0")}`,
      ...c,
      score,
      reasons
    };
  });

  // Filter score >= 70 & max Top 1,000
  scoredCandidates.sort((a, b) => b.score - a.score);
  const scorePassedCandidates = scoredCandidates.filter(c => c.score >= 70);
  const top1000Candidates = scorePassedCandidates.slice(0, 1000);

  return {
    totalComponents: rawComponents.length,
    geometryFilteredCount: geometryFiltered.length,
    objectnessPassedCount: scorePassedCandidates.length,
    top1000Candidates,
    scoredCandidates
  };
}

async function testPipeline() {
  console.log("=================================================");
  console.log("  TESTING CAD SYMBOL OBJECTNESS SCORE RANKING   ");
  console.log("=================================================\n");

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
    console.error("Plan tiles not found for test.");
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "obj-test-"));
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

  console.log("Stitched plan PNG created. Running CAD Symbol Objectness Score Ranking...");

  const startTime = Date.now();
  const {
    totalComponents,
    geometryFilteredCount,
    objectnessPassedCount,
    top1000Candidates
  } = await extractSymbolCandidates(flattenedPng);
  const elapsedMs = Date.now() - startTime;

  console.log("\nPIPELINE DIAGNOSTICS REPORT:");
  console.log(`COMPONENTS: ${totalComponents}`);
  console.log(`GEOMETRY FILTER: ${geometryFilteredCount}`);
  console.log(`OBJECTNESS SCORE PASS (score >= 70): ${objectnessPassedCount}`);
  console.log(`EMBEDDING: ${top1000Candidates.length}`);
  console.log(`Execution Time: ${elapsedMs} ms`);

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

testPipeline().catch(err => console.error("Test error:", err));
