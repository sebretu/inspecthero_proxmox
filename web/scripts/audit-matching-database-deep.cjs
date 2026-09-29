const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function auditPatternDatabase() {
  console.log("=================================================");
  console.log("  1. AUDIT BAZY WZORCÓW (symbol_crops)           ");
  console.log("=================================================");

  // Select symbol_type and embedding cast to text using RPC or query
  const { data: crops, error } = await supabase
    .from("symbol_crops")
    .select("id, symbol_type, quality_status, embedding")
    .eq("quality_status", "approved");

  if (error || !crops) {
    console.error("Error querying symbol_crops:", error?.message);
    return;
  }

  // Parse embeddings
  const cropsWithEmbedding = [];
  for (const c of crops) {
    let vec = c.embedding;
    if (typeof vec === "string") {
      try {
        vec = JSON.parse(vec);
      } catch {
        vec = vec.replace(/^\[/, "").replace(/\]$/, "").split(",").map(Number);
      }
    }
    if (Array.isArray(vec) && vec.length > 0) {
      cropsWithEmbedding.push({ ...c, vec });
    }
  }

  console.log(`Zaleziono ${cropsWithEmbedding.length} / ${crops.length} zatwierdzonych (approved) kadrów z wektorami w symbol_crops.\n`);

  // Count per class
  const classCounts = {};
  cropsWithEmbedding.forEach(c => {
    classCounts[c.symbol_type] = (classCounts[c.symbol_type] || 0) + 1;
  });

  console.log("LICZBA WZORCÓW DLA KAŻDEJ KLASY:");
  Object.entries(classCounts).forEach(([type, cnt]) => {
    console.log(`  - ${type.padEnd(16)}: ${cnt} wzorców`);
  });

  const cropsByClass = {};
  cropsWithEmbedding.forEach(c => {
    if (!cropsByClass[c.symbol_type]) cropsByClass[c.symbol_type] = [];
    cropsByClass[c.symbol_type].push(c);
  });

  const classes = Object.keys(cropsByClass);

  // Pairwise Similarity: Intra-class & Inter-class
  console.log("\n=================================================");
  console.log("  2. PAIRWISE SIMILARITY MATRIX WZORCÓW          ");
  console.log("=================================================");

  const interMatrix = {};
  for (const c1 of classes) {
    interMatrix[c1] = {};
    for (const c2 of classes) {
      interMatrix[c1][c2] = [];
    }
  }

  for (let i = 0; i < cropsWithEmbedding.length; i++) {
    for (let j = i + 1; j < cropsWithEmbedding.length; j++) {
      const cropA = cropsWithEmbedding[i];
      const cropB = cropsWithEmbedding[j];

      const sim = cosineSimilarity(cropA.vec, cropB.vec);
      interMatrix[cropA.symbol_type][cropB.symbol_type].push(sim);
      interMatrix[cropB.symbol_type][cropA.symbol_type].push(sim);
    }
  }

  console.log("\nŚREDNIE PODOBIEŃSTWO WEWNĄTRZKLASOWE (Intra-class Pairwise Similarity):");
  const intraMeans = {};
  for (const c of classes) {
    const sims = interMatrix[c][c];
    if (sims.length > 0) {
      const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
      let max = -Infinity;
      let min = Infinity;
      for (let k = 0; k < sims.length; k++) {
        if (sims[k] > max) max = sims[k];
        if (sims[k] < min) min = sims[k];
      }
      intraMeans[c] = avg;
      console.log(`  - ${c.padEnd(16)}: Średnie = ${avg.toFixed(4)} | Max = ${max.toFixed(4)} | Min = ${min.toFixed(4)} (${sims.length} par)`);
    } else {
      intraMeans[c] = 1.0;
      console.log(`  - ${c.padEnd(16)}: Tylko 1 wzorzec (brak par)`);
    }
  }

  console.log("\nMACIERZ ŚREDNICH PODOBIEŃSTW MIĘDZYKLASOWYCH (Inter-class Pairwise Similarity Matrix):");
  console.log("Klasa".padEnd(16) + classes.map(c => c.padStart(12)).join(""));
  for (const c1 of classes) {
    let rowStr = c1.padEnd(16);
    for (const c2 of classes) {
      const sims = interMatrix[c1][c2];
      if (sims.length > 0) {
        const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
        rowStr += avg.toFixed(4).padStart(12);
      } else {
        rowStr += (c1 === c2 ? "1.0000" : "N/A").padStart(12);
      }
    }
    console.log(rowStr);
  }

  // 3. TOP-10 NEAREST NEIGHBORS CONFUSION MATRIX FOR PATTERN DB
  console.log("\n=================================================");
  console.log("  3. CONFUSION MATRIX DLA TOP-10 NEAREST NEIGHBORS ");
  console.log("=================================================");

  const confusionMatrix = {};
  classes.forEach(c1 => {
    confusionMatrix[c1] = {};
    classes.forEach(c2 => confusionMatrix[c1][c2] = 0);
  });

  const gapDistribution = [];

  for (const cropA of cropsWithEmbedding) {
    const similarities = [];
    for (const cropB of cropsWithEmbedding) {
      if (cropA.id === cropB.id) continue;
      const sim = cosineSimilarity(cropA.vec, cropB.vec);
      similarities.push({ crop: cropB, similarity: sim });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);

    const top10 = similarities.slice(0, 10);
    top10.forEach(match => {
      confusionMatrix[cropA.symbol_type][match.crop.symbol_type]++;
    });

    if (top10.length >= 2) {
      const bestSim = top10[0].similarity;
      const secondSim = top10[1].similarity;
      const gap = bestSim - secondSim;
      gapDistribution.push({
        cropId: cropA.id,
        cropType: cropA.symbol_type,
        bestType: top10[0].crop.symbol_type,
        secondType: top10[1].crop.symbol_type,
        bestSim: Number(bestSim.toFixed(4)),
        secondSim: Number(secondSim.toFixed(4)),
        gap: Number(gap.toFixed(4))
      });
    }
  }

  console.log("\nCONFUSION MATRIX (Liczba dopasowań Top-10 sąsiadów w bazie wzorców):");
  console.log("Rzeczywista".padEnd(16) + classes.map(c => c.padStart(12)).join(""));
  for (const c1 of classes) {
    let rowStr = c1.padEnd(16);
    for (const c2 of classes) {
      rowStr += String(confusionMatrix[c1][c2]).padStart(12);
    }
    console.log(rowStr);
  }

  gapDistribution.sort((a, b) => a.gap - b.gap);
  console.log("\nWZORCE Z NAJMNIJSZYM GAP W BAZIE (Przykłady nakładających się klas w DB):");
  gapDistribution.slice(0, 10).forEach((g, idx) => {
    console.log(`  ${idx + 1}. Crop ${g.cropType} (${g.cropId}): Best=${g.bestType} (${g.bestSim}), 2nd=${g.secondType} (${g.secondSim}) -> GAP = ${g.gap}`);
  });

  // Calculate inter-class summary means
  const interMatrixMeans = {};
  for (const c1 of classes) {
    interMatrixMeans[c1] = {};
    for (const c2 of classes) {
      const sims = interMatrix[c1][c2];
      interMatrixMeans[c1][c2] = sims.length > 0 ? Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4)) : (c1 === c2 ? 1.0 : 0);
    }
  }

  const summary = {
    totalCropsApproved: crops.length,
    cropsWithEmbedding: cropsWithEmbedding.length,
    classCounts,
    intraMeans,
    interMatrixMeans,
    confusionMatrix,
    top10SmallestGapsInDB: gapDistribution.slice(0, 15)
  };

  fs.writeFileSync(
    path.join(__dirname, "pattern_db_audit_results.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log("\nZapisano wyniki audytu bazy wzorców do pattern_db_audit_results.json.");
}

auditPatternDatabase().catch(err => console.error("Pattern DB audit error:", err));
