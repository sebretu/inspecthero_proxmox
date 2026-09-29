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

async function runCoordinateAudit() {
  console.log("=================================================");
  console.log("  COORDINATE SYSTEM & SPATIAL OFFSET AUDIT       ");
  console.log("=================================================\n");

  const debugDir = path.join(process.cwd(), "debug");
  await fs.mkdir(debugDir, { recursive: true });

  // 1. Fetch Plans with Ground Truth & AI Predictions
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, pdf_path, image_width, image_height");

  const { data: allStromkreise } = await supabase
    .from("stromkreise")
    .select("id, plan_id, type, x_norm, y_norm");

  const { data: allPredictions } = await supabase
    .from("symbol_predictions")
    .select("id, plan_id, x_norm, y_norm, crop_path, predicted_symbol_type, confidence, metadata")
    .eq("status", "pending");

  console.log("Auditing plan coordinate systems & DB metadata...\n");

  const predictionDebugData = [];

  for (const p of (plans || [])) {
    const planGt = (allStromkreise || []).filter(s => s.plan_id === p.id);
    const planPreds = (allPredictions || []).filter(pred => pred.plan_id === p.id);

    if (planGt.length === 0 && planPreds.length === 0) continue;

    console.log(`Plan [${p.name}] (${p.id}):`);
    console.log(`  - DB Metadata image_width:  ${p.image_width}`);
    console.log(`  - DB Metadata image_height: ${p.image_height}`);
    console.log(`  - Ground Truth Markers:    ${planGt.length}`);
    console.log(`  - AI Detector Predictions:  ${planPreds.length}`);

    // Check tile grid metadata in private_tiles
    const searchDirs = [
      "/home/ubuntu/private_tiles",
      path.join(process.cwd(), "private_tiles"),
      path.join(process.cwd(), "web", "private_tiles"),
    ];

    let meta = null;
    let tileDirFound = null;

    for (const dir of searchDirs) {
      const pPath = path.join(dir, p.id, "meta.json");
      try {
        const raw = await fs.readFile(pPath, "utf-8");
        meta = JSON.parse(raw);
        if (meta) {
          tileDirFound = path.join(dir, p.id);
          break;
        }
      } catch {}
    }

    if (meta) {
      const tileWidth = meta.gridW * 256;
      const tileHeight = meta.gridH * 256;
      console.log(`  - Tile Grid Dimensions:    ${tileWidth} x ${tileHeight} (gridW: ${meta.gridW}, gridH: ${meta.gridH})`);
      
      const scaleX = tileWidth / (p.image_width || 1);
      const scaleY = tileHeight / (p.image_height || 1);
      console.log(`  - Scale Factor Tile vs DB: scaleX = ${scaleX.toFixed(4)}, scaleY = ${scaleY.toFixed(4)}`);
    }

    for (const pred of planPreds) {
      const renderW = meta ? meta.gridW * 256 : (p.image_width || 7021);
      const renderH = meta ? meta.gridH * 256 : (p.image_height || 4967);

      predictionDebugData.push({
        prediction_id: pred.id,
        plan_id: p.id,
        plan_name: p.name,
        detected_x: Math.round(pred.x_norm * renderW),
        detected_y: Math.round(pred.y_norm * renderH),
        normalized_x: pred.x_norm,
        normalized_y: pred.y_norm,
        image_width: p.image_width,
        image_height: p.image_height,
        tile_grid_width: meta ? meta.gridW * 256 : null,
        tile_grid_height: meta ? meta.gridH * 256 : null,
        scale_factor_x: meta ? (meta.gridW * 256 / (p.image_width || 1)) : 1.0,
        scale_factor_y: meta ? (meta.gridH * 256 / (p.image_height || 1)) : 1.0,
        offset_x: 0,
        offset_y: 0
      });
    }

    // --- STEP 4: Spatial Distance Test on 10 Manual Markers ---
    if (planGt.length > 0 && planPreds.length > 0) {
      console.log(`\n  TEST NA 10 RĘCZNYCH MARKERACH (Plan ${p.name}):`);
      const sampleGt = planGt.slice(0, 10);
      const renderW = meta ? meta.gridW * 256 : (p.image_width || 7021);
      const renderH = meta ? meta.gridH * 256 : (p.image_height || 4967);

      sampleGt.forEach((gt, idx) => {
        const gtPixelX = Math.round(gt.x_norm * renderW);
        const gtPixelY = Math.round(gt.y_norm * renderH);

        let minPredDist = 999999;
        let nearestPred = null;

        for (const pred of planPreds) {
          const predPixelX = Math.round(pred.x_norm * renderW);
          const predPixelY = Math.round(pred.y_norm * renderH);
          const d = getDistance(gtPixelX, gtPixelY, predPixelX, predPixelY);
          if (d < minPredDist) {
            minPredDist = d;
            nearestPred = { predPixelX, predPixelY, type: pred.predicted_symbol_type };
          }
        }

        console.log(`  GT #${idx + 1} (${gt.type}): marker = (${gtPixelX}, ${gtPixelY}) | nearest pred = (${nearestPred?.predPixelX}, ${nearestPred?.predPixelY}) [${nearestPred?.type}] | distance = ${minPredDist.toFixed(1)} px`);
      });
    }
    console.log("-------------------------------------------------");
  }

  // Save prediction_debug.json
  const debugJsonPath = path.join(process.cwd(), "prediction_debug.json");
  await fs.writeFile(debugJsonPath, JSON.stringify(predictionDebugData, null, 2));
  console.log(`\nSaved prediction_debug.json to ${debugJsonPath}`);

  // --- STEP 2: Generate Visual Overlay Image (debug/overlay-ground-truth.png) ---
  console.log("\n=================================================");
  console.log("  GENERATING VISUAL OVERLAY IMAGE                ");
  console.log("=================================================");

  const targetPlanId = "b2a2280e-f471-48f6-94f1-5290609ecb52";
  const searchDirsOverlay = [
    "/home/ubuntu/private_tiles",
    path.join(process.cwd(), "private_tiles"),
    path.join(process.cwd(), "web", "private_tiles"),
  ];

  let metaOverlay = null;
  let tileDirOverlay = null;

  for (const dir of searchDirsOverlay) {
    const pPath = path.join(dir, targetPlanId, "meta.json");
    try {
      const raw = await fs.readFile(pPath, "utf-8");
      metaOverlay = JSON.parse(raw);
      if (metaOverlay) {
        tileDirOverlay = path.join(dir, targetPlanId);
        break;
      }
    } catch {}
  }

  if (tileDirOverlay && metaOverlay) {
    const zoom = metaOverlay.maxZoom || 5;
    const compositeInputs = [];
    for (let x = 0; x < metaOverlay.gridW; x++) {
      for (let y = 0; y < metaOverlay.gridH; y++) {
        const tilePath = path.join(tileDirOverlay, String(zoom), String(x), `${y}.png`);
        try {
          await fs.access(tilePath);
          compositeInputs.push({ input: tilePath, left: x * 256, top: y * 256 });
        } catch {}
      }
    }

    const stitchedPng = path.join(debugDir, "stitched_temp.png");
    await sharp({
      create: {
        width: metaOverlay.gridW * 256,
        height: metaOverlay.gridH * 256,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).composite(compositeInputs).png().toFile(stitchedPng);

    const W = metaOverlay.gridW * 256;
    const H = metaOverlay.gridH * 256;

    const gtList = (allStromkreise || []).filter(s => s.plan_id === targetPlanId);
    const predList = (allPredictions || []).filter(p => p.plan_id === targetPlanId);

    // Build SVG Overlay
    let svgOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

    // Draw GREEN circles for GT markers
    gtList.forEach(gt => {
      const cx = Math.round(gt.x_norm * W);
      const cy = Math.round(gt.y_norm * H);
      svgOverlay += `<circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="#00FF00" stroke-width="4"/>`;
    });

    // Draw RED circles for AI Predictions
    predList.forEach(pred => {
      const cx = Math.round(pred.x_norm * W);
      const cy = Math.round(pred.y_norm * H);
      svgOverlay += `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="#FF0000" stroke-width="4"/>`;
      svgOverlay += `<rect x="${cx - 18}" y="${cy - 18}" width="36" height="36" fill="none" stroke="#0088FF" stroke-width="2"/>`;
    });

    svgOverlay += `</svg>`;

    const overlayPath = path.join(debugDir, "overlay-ground-truth.png");
    await sharp(stitchedPng)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .png()
      .toFile(overlayPath);

    await fs.unlink(stitchedPng).catch(() => {});
    console.log(`Saved visual overlay image to ${overlayPath}`);
  }
}

runCoordinateAudit().catch(err => console.error("Audit error:", err));
