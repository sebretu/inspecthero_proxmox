const sharp = require("sharp");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

async function debugPlanComponents() {
  const planId = "1d5e5455-5baf-47c1-86a0-567e5fedc58b";
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
    console.error("Plan tiles not found for 1d5e5455-5baf-47c1-86a0-567e5fedc58b");
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmp-debug-"));
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

  console.log("Stitched plan PNG created for plan 1d5e5455-5baf-47c1-86a0-567e5fedc58b.");

  const sharpImg = sharp(flattenedPng);
  const metadata = await sharpImg.metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;
  console.log(`Plan Dimensions: ${imgW} x ${imgH}`);

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
        width: origW,
        height: origH,
        area: origW * origH,
        pixelCount: pixelCount * scale * scale,
        aspectRatio: origW / origH,
        greenPixelCount: greenPixelCount * scale * scale,
        redPixelCount: redPixelCount * scale * scale
      });
    }
  }

  console.log(`TOTAL RAW COMPONENTS: ${rawComponents.length}`);
  if (rawComponents.length > 0) {
    const sortedByW = [...rawComponents].sort((a, b) => b.width - a.width);
    console.log("Sample Top 10 Largest Component Widths:", sortedByW.slice(0, 10).map(c => `w:${c.width}, h:${c.height}, area:${c.area}, px:${c.pixelCount}, aspect:${c.aspectRatio.toFixed(2)}`));

    const filterPass = rawComponents.filter(c => c.width >= 4 && c.height >= 4 && c.pixelCount >= 6 && c.area <= 18000 && c.aspectRatio <= 5.5 && c.aspectRatio >= 0.18);
    console.log(`COMPONENTS PASSING GEOMETRY FILTER: ${filterPass.length}`);
  }

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

debugPlanComponents().catch(err => console.error("Error:", err));
