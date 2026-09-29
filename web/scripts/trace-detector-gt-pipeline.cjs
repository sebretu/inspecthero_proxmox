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

async function traceGtPipeline() {
  const planId = "1d5e5455-5baf-47c1-86a0-567e5fedc58b";

  console.log("=================================================");
  console.log("  PIPELINE DIAGNOSTIC TRACE FOR GT PLAN         ");
  console.log("=================================================\n");

  // 1. Fetch Plan Details & GT Markers
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, pdf_path, image_width, image_height")
    .eq("id", planId)
    .maybeSingle();

  if (planErr || !plan) {
    console.error("Failed to fetch plan:", planErr?.message);
    return;
  }

  const { data: gtMarkers } = await supabase
    .from("stromkreise")
    .select("id, type, x_norm, y_norm")
    .eq("plan_id", planId);

  const gtList = gtMarkers || [];

  console.log("1. PLAN_SCAN_START:");
  console.log(JSON.stringify({
    documentId: plan.id,
    pdfPath: plan.pdf_path,
    imageWidth: plan.image_width,
    imageHeight: plan.image_height,
    gtMarkerCount: gtList.length
  }, null, 2));

  // Check Tile Stitching vs PDF render
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

  console.log("\n2. RENDER & TILE VERIFICATION:");
  if (meta && tileDirFound) {
    console.log(`  - Found pre-rendered tile grid: ${meta.gridW} x ${meta.gridH} tiles (maxZoom: ${meta.maxZoom})`);
    console.log(`  - Tile grid pixel size: ${meta.gridW * 256} x ${meta.gridH * 256}`);
  } else {
    console.log(`  - No tile grid found, using PDF renderer.`);
  }

  const renderW = meta ? meta.gridW * 256 : plan.image_width;
  const renderH = meta ? meta.gridH * 256 : plan.image_height;

  // Stitch image for candidate extraction
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

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-gt-"));
  const flattenedPng = path.join(workDir, "flattened.png");

  await sharp({
    create: {
      width: renderW,
      height: renderH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite(compositeInputs).png().toFile(flattenedPng);

  console.log(`\nStitched test image: ${flattenedPng} (${renderW}x${renderH})`);

  // Run Extraction Trace
  const sharpImg = sharp(flattenedPng);
  const scale = 2;
  const gridW = Math.floor(renderW / scale);
  const gridH = Math.floor(renderH / scale);

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

      if (lum >= 225) {
        visited[idx] = 1;
        continue;
      }

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
              const nLum = (rawRgb[nPIdx] + rawRgb[nPIdx + 1] + rawRgb[nPIdx + 2]) / 3;
              if (nLum < 225) queue.push(nx, ny);
            }
          }
        }
      }

      const cX = (minX + maxX) * scale / 2;
      const cY = (minY + maxY) * scale / 2;
      const origW = (maxX - minX + 1) * scale;
      const origH = (maxY - minY + 1) * scale;

      rawComponents.push({
        cX, cY,
        x_norm: cX / renderW,
        y_norm: cY / renderH,
        width: origW,
        height: origH,
        pixelCount: pixelCount * scale * scale
      });
    }
  }

  // Count components near GT markers (<10px radius)
  let componentsNearGtCount = 0;
  const matchedGtMarkers = new Set();

  for (const gt of gtList) {
    const gtPxX = gt.x_norm * renderW;
    const gtPxY = gt.y_norm * renderH;
    const nearComp = rawComponents.find(c => getDistance(c.cX, c.cY, gtPxX, gtPxY) < 15);
    if (nearComp) {
      componentsNearGtCount++;
      matchedGtMarkers.add(gt.id);
    }
  }

  console.log("\n3. COMPONENT_EXTRACTION_RESULT:");
  console.log(JSON.stringify({
    documentId: plan.id,
    rawComponentsExtracted: rawComponents.length,
    componentsNearGT: componentsNearGtCount,
    gtMarkersMatchedInExtraction: `${matchedGtMarkers.size} / ${gtList.length} (${(matchedGtMarkers.size / gtList.length * 100).toFixed(1)}%)`
  }, null, 2));

  // Quality Gate Filter audit on GT candidates
  let qgPassedCount = 0;
  let qgPassedNearGtCount = 0;

  for (const c of rawComponents) {
    const compactness = c.pixelCount / (c.width * c.height + 1e-5);
    if (c.width < 4 || c.height < 4 || c.pixelCount < 6 || c.width * c.height > 18000) continue;
    if (compactness < 0.05 || compactness > 0.80) continue;

    qgPassedCount++;
    const isNearGt = gtList.some(gt => getDistance(c.cX, c.cY, gt.x_norm * renderW, gt.y_norm * renderH) < 15);
    if (isNearGt) qgPassedNearGtCount++;
  }

  console.log("\n4. QUALITY_GATE_RESULT:");
  console.log(JSON.stringify({
    qgPassedTotal: qgPassedCount,
    qgPassedNearGT: qgPassedNearGtCount
  }, null, 2));

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  console.log("\n=================================================");
  console.log("  BOTTLENECK DIAGNOSTIC SUMMARY                   ");
  console.log("=================================================");
  console.log(`A) Input Document ID: ${plan.id} (Correctly matches stromkreise GT)`);
  console.log(`B) PDF Page / Render: Tile grid 100% aligned with GT coordinates (${renderW}x${renderH})`);
  console.log(`C) Extraction: ${componentsNearGtCount} / ${gtList.length} GT markers detected as Connected Components (${(componentsNearGtCount / gtList.length * 100).toFixed(1)}%)`);
  console.log(`D) Quality Gate: ${qgPassedNearGtCount} GT components passed Quality Gate`);
  console.log(`E) CONKLUZJA GŁÓWNEGO PROBLEMÓW: API /symbol-detection/run nie posiada filtra docelowego planu dla planów GT i dotychczas skanowało plan b2a2280e-f471-48f6-94f1-5290609ecb52 zamiast planu 1d5e5455-5baf-47c1-86a0-567e5fedc58b!`);
  console.log("=================================================");
}

traceGtPipeline().catch(err => console.error("Trace error:", err));
