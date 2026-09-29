const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const sharp = require("sharp");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Line-Inverted Feature Embedding (White background = 0.0, CAD lines = 1.0 + Color Features)
 */
async function generateLineInvertedEmbedding(imageInput) {
  const rawRgb = await sharp(imageInput).raw().toBuffer({ resolveWithObject: true });
  const w = rawRgb.info.width;
  const h = rawRgb.info.height;
  const channels = rawRgb.info.channels || 3;

  // Resize to 24x24 RGB raw
  const { data: thumb24, info: tInfo } = await sharp(imageInput)
    .resize(24, 24, { fit: "fill" })
    .toFormat("raw")
    .toBuffer({ resolveWithObject: true });

  const tCh = tInfo.channels || 3;
  const lineValues = [];
  const greenValues = [];
  const redValues = [];

  for (let i = 0; i < thumb24.length; i += tCh) {
    const r = thumb24[i], g = thumb24[i + 1], b = thumb24[i + 2];
    const lum = (r + g + b) / 3;

    // Line intensity (inverted: white background = 0.0, dark CAD line = 1.0)
    const lineVal = Math.max(0, (255 - lum) / 255);
    lineValues.push(lineVal);

    // Green color intensity (green CAD line = 1.0, white/grey = 0.0)
    const greenVal = (g > 60 && g > r + 20 && g > b + 20) ? Math.min(1.0, (g - Math.max(r, b)) / 100) : 0;
    greenValues.push(greenVal);

    // Red color intensity (red CAD line / CEE = 1.0, white/grey = 0.0)
    const redVal = (r > 60 && r > g + 20 && r > b + 20) ? Math.min(1.0, (r - Math.max(g, b)) / 100) : 0;
    redValues.push(redVal);
  }

  // Combine line structural features (576) + green features (576) + red features (576)
  const vector = [...lineValues, ...greenValues, ...redValues];

  // L2 normalization
  const sumSq = vector.reduce((sum, val) => sum + val * val, 0);
  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    return vector.map(v => Number((v / magnitude).toFixed(6)));
  }
  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

async function runAudit() {
  console.log("=================================================");
  console.log("  LINE-INVERTED EMBEDDING FEATURE EXPERIMENT    ");
  console.log("=================================================\n");

  const { data: crops } = await supabase
    .from("symbol_crops")
    .select("id, symbol_type, image_path")
    .eq("quality_status", "approved")
    .limit(100);

  const embsByType = {};
  for (const c of crops) {
    try {
      const { data: file } = await supabase.storage.from("symbol-crops").download(c.image_path);
      if (!file) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const emb = await generateLineInvertedEmbedding(buffer);

      if (!embsByType[c.symbol_type]) embsByType[c.symbol_type] = [];
      embsByType[c.symbol_type].push(emb);
    } catch {}
  }

  const types = ["socket", "edv", "cee", "light", "special"];
  console.log("Inter-Class Cosine Similarity Matrix (Line-Inverted + Color Embeddings):");
  console.log("Symbol A \t Symbol B \t Average Cosine Similarity");
  console.log("------------------------------------------------------------------");

  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const typeA = types[i];
      const typeB = types[j];
      const listA = embsByType[typeA] || [];
      const listB = embsByType[typeB] || [];

      if (listA.length > 0 && listB.length > 0) {
        let total = 0, count = 0;
        for (let a = 0; a < Math.min(listA.length, 20); a++) {
          for (let b = 0; b < Math.min(listB.length, 20); b++) {
            total += cosineSimilarity(listA[a], listB[b]);
            count++;
          }
        }
        const avg = count > 0 ? (total / count).toFixed(4) : "N/A";
        console.log(`${typeA}\t\t ${typeB}\t\t ${avg}`);
      }
    }
  }

  console.log("\nIntra-Class Cosine Similarity (Same Symbol Type Match):");
  for (const t of types) {
    const list = embsByType[t] || [];
    if (list.length > 1) {
      let total = 0, count = 0;
      for (let i = 0; i < Math.min(list.length, 20); i++) {
        for (let j = i + 1; j < Math.min(list.length, 20); j++) {
          total += cosineSimilarity(list[i], list[j]);
          count++;
        }
      }
      console.log(`Intra-class [${t}]: ${(total / count).toFixed(4)}`);
    }
  }
}

runAudit().catch(err => console.error("Audit error:", err));
