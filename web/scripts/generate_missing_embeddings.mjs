import dns from "dns";
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import sharp from "sharp";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function generateImageEmbeddingSync(raw24Buffer, raw12Buffer) {
  const thumb24Values = Array.from(raw24Buffer).map(v => v / 255);
  const edgeValues = new Array(144).fill(0);
  const w = 12;
  const h = 12;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = (
        -raw12Buffer[(y - 1) * w + (x - 1)] + raw12Buffer[(y - 1) * w + (x + 1)] +
        -2 * raw12Buffer[y * w + (x - 1)] + 2 * raw12Buffer[y * w + (x + 1)] +
        -raw12Buffer[(y + 1) * w + (x - 1)] + raw12Buffer[(y + 1) * w + (x + 1)]
      );
      const gy = (
        -raw12Buffer[(y - 1) * w + (x - 1)] - 2 * raw12Buffer[(y - 1) * w + x] - raw12Buffer[(y - 1) * w + (x + 1)] +
        raw12Buffer[(y + 1) * w + (x - 1)] + 2 * raw12Buffer[(y + 1) * w + x] + raw12Buffer[(y + 1) * w + (x + 1)]
      );
      edgeValues[y * w + x] = Math.min(1.0, Math.sqrt(gx * gx + gy * gy) / 255);
    }
  }

  const horProj = new Array(24).fill(0);
  const verProj = new Array(24).fill(0);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const val = thumb24Values[y * 24 + x];
      horProj[y] += val;
      verProj[x] += val;
    }
  }
  const horProjNorm = horProj.map(v => v / 24);
  const verProjNorm = verProj.map(v => v / 24);

  const vector = [...thumb24Values, ...edgeValues, ...horProjNorm, ...verProjNorm];
  while (vector.length < 768) vector.push(0);
  const finalVector = vector.slice(0, 768);

  const sumSq = finalVector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    return finalVector.map(v => Number((v / magnitude).toFixed(6)));
  }
  return finalVector;
}

async function run() {
  console.log("[EmbeddingGenerator] Fetching symbol crops without embedding...");
  const { data: crops, error } = await supabase
    .from("symbol_crops")
    .select("id, image_path, symbol_type")
    .is("embedding", null);

  if (error) {
    console.error("Failed to query symbol_crops:", error);
    process.exit(1);
  }

  console.log(`[EmbeddingGenerator] Total crops requiring embeddings: ${crops.length}`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < crops.length; i++) {
    const crop = crops[i];
    try {
      const { data: file, error: dlErr } = await supabase.storage
        .from("symbol-crops")
        .download(crop.image_path);

      if (dlErr || !file) {
        failCount++;
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const img = sharp(buffer).grayscale();
      const raw24 = await img.clone().resize(24, 24, { fit: "fill" }).raw().toBuffer();
      const raw12 = await img.clone().resize(12, 12, { fit: "fill" }).raw().toBuffer();

      const vector = generateImageEmbeddingSync(raw24, raw12);

      const { error: updErr } = await supabase
        .from("symbol_crops")
        .update({
          embedding: vector,
          embedding_status: "completed"
        })
        .eq("id", crop.id);

      if (updErr) {
        failCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      failCount++;
    }

    if ((i + 1) % 50 === 0 || i === crops.length - 1) {
      console.log(`[EmbeddingGenerator] Processed ${i + 1}/${crops.length} (Success: ${successCount}, Failed: ${failCount})`);
    }
  }

  console.log(`[EmbeddingGenerator] COMPLETE! Processed: ${crops.length}, Success: ${successCount}, Failed: ${failCount}`);
  process.exit(0);
}

run();
