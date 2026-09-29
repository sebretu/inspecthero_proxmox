const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateImageEmbedding(imageInput) {
  const rawImg = sharp(imageInput);

  const { data: rawRgb256, info: info256 } = await rawImg
    .clone()
    .resize(16, 16, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const ch256 = info256.channels || 3;
  const line256Values = [];
  const green256Values = [];

  for (let i = 0; i < rawRgb256.length; i += ch256) {
    const r = rawRgb256[i], g = rawRgb256[i + 1], b = rawRgb256[i + 2];
    const lum = (r + g + b) / 3;

    const lineVal = Math.max(0, (245 - lum) / 245);
    line256Values.push(lineVal);

    const greenVal = (g > 60 && g > r + 18 && g > b + 18) ? Math.min(1.0, (g - Math.max(r, b)) / 80) : 0;
    green256Values.push(greenVal);
  }

  const { data: rawRgb128, info: info128 } = await rawImg
    .clone()
    .resize(16, 8, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const ch128 = info128.channels || 3;
  const red128Values = [];

  for (let i = 0; i < rawRgb128.length; i += ch128) {
    const r = rawRgb128[i], g = rawRgb128[i + 1], b = rawRgb128[i + 2];
    const redVal = (r > 60 && r > g + 18 && r > b + 18) ? Math.min(1.0, (r - Math.max(g, b)) / 80) : 0;
    red128Values.push(redVal);
  }

  const gray8Buffer = await rawImg.clone().grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const edge64Values = new Array(64).fill(0);
  const w = 8, h = 8;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = (
        -gray8Buffer[(y - 1) * w + (x - 1)] + gray8Buffer[(y - 1) * w + (x + 1)] +
        -2 * gray8Buffer[y * w + (x - 1)] + 2 * gray8Buffer[y * w + (x + 1)] +
        -gray8Buffer[(y + 1) * w + (x - 1)] + gray8Buffer[(y + 1) * w + (x + 1)]
      );
      const gy = (
        -gray8Buffer[(y - 1) * w + (x - 1)] - 2 * gray8Buffer[(y - 1) * w + x] - gray8Buffer[(y - 1) * w + (x + 1)] +
        gray8Buffer[(y + 1) * w + (x - 1)] + 2 * gray8Buffer[(y + 1) * w + x] + gray8Buffer[(y + 1) * w + (x + 1)]
      );
      edge64Values[y * w + x] = Math.min(1.0, Math.sqrt(gx * gx + gy * gy) / 255);
    }
  }

  const horProj = new Array(32).fill(0);
  const verProj = new Array(32).fill(0);
  const projBuffer = await rawImg.clone().grayscale().resize(32, 32, { fit: "fill" }).raw().toBuffer();

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const val = Math.max(0, (245 - projBuffer[y * 32 + x]) / 245);
      horProj[y] += val;
      verProj[x] += val;
    }
  }
  const horProjNorm = horProj.map(v => Math.min(1.0, v / 32));
  const verProjNorm = verProj.map(v => Math.min(1.0, v / 32));
  const proj64Values = [...horProjNorm, ...verProjNorm];

  const vector = [
    ...line256Values,
    ...green256Values,
    ...red128Values,
    ...edge64Values,
    ...proj64Values
  ];

  while (vector.length < 768) vector.push(0);
  const finalVector = vector.slice(0, 768);

  const sumSq = finalVector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    return finalVector.map(v => Number((v / magnitude).toFixed(6)));
  }
  return finalVector;
}

async function reindex() {
  console.log("=================================================");
  console.log("  STAGE 3: RE-INDEXING `symbol_crops` EMBEDDINGS ");
  console.log("=================================================\n");

  const { data: crops, error } = await supabase
    .from("symbol_crops")
    .select("id, image_path, symbol_type")
    .not("image_path", "is", null);

  if (error || !crops) {
    console.error("Failed to fetch crops:", error?.message);
    return;
  }

  console.log(`Re-indexing ${crops.length} crops in Supabase database...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < crops.length; i++) {
    const crop = crops[i];
    try {
      const { data: file, error: dlErr } = await supabase.storage.from("symbol-crops").download(crop.image_path);
      if (dlErr || !file) {
        failCount++;
        continue;
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const newVector = await generateImageEmbedding(buffer);

      const { error: upErr } = await supabase
        .from("symbol_crops")
        .update({ embedding: newVector })
        .eq("id", crop.id);

      if (upErr) {
        failCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      failCount++;
    }

    if ((i + 1) % 100 === 0 || i === crops.length - 1) {
      console.log(`Progress: ${i + 1}/${crops.length} crops re-indexed (Success: ${successCount}, Failed: ${failCount})`);
    }
  }

  console.log("\n=================================================");
  console.log("  RE-INDEXING COMPLETED SUCCESSFULLY             ");
  console.log(`  Total Re-indexed: ${successCount}/${crops.length}`);
  console.log("=================================================");
}

reindex().catch(err => console.error("Reindexing error:", err));
