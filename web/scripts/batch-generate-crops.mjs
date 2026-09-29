import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { generateSymbolCrop } from "../src/lib/symbolCropper.ts";
import { processQueue } from "../src/lib/embeddingQueue.ts";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.inspecthero.pl",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

async function runBatchCrops() {
  console.log("\n==============================================");
  console.log("Starting Batch Crop Generation for All Markers");
  console.log("==============================================\n");

  const { data: markers, error: markersErr } = await supabase
    .from("stromkreise")
    .select("id, plan_id")
    .order("created_at", { ascending: false });

  if (markersErr) {
    console.error("Failed to fetch stromkreise markers:", markersErr.message);
    process.exit(1);
  }

  console.log(`Found ${markers.length} total markers in stromkreise.`);

  // Check how many crops already exist
  const { data: existingCrops } = await supabase
    .from("symbol_crops")
    .select("stromkreis_id");

  const existingSet = new Set((existingCrops || []).map((c) => c.stromkreis_id));
  console.log(`Already existing crops in symbol_crops: ${existingSet.size}`);

  const toProcess = markers.filter((m) => !existingSet.has(m.id));
  console.log(`Markers remaining to process: ${toProcess.length}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const marker = toProcess[i];
    console.log(`[Batch ${i + 1}/${toProcess.length}] Processing marker ${marker.id}...`);

    try {
      await generateSymbolCrop(marker.id);
      successCount++;
    } catch (err) {
      console.error(`  -> Crop generation error for ${marker.id}:`, err.message);
      failCount++;
    }
  }

  console.log(`\nCrop extraction finished. Success: ${successCount}, Failed: ${failCount}`);

  // Now process embeddings queue
  console.log("\n--- Processing Vector Embeddings Queue ---");
  let totalProcessedEmbeddings = 0;

  while (true) {
    const count = await processQueue();
    if (count === 0) break;
    totalProcessedEmbeddings += count;
    console.log(`Processed batch of ${count} vector embeddings...`);
  }

  console.log(`Finished processing ${totalProcessedEmbeddings} total vector embeddings.`);
  console.log("\n==============================================");
  console.log("Batch Crop & Embedding Generation Completed");
  console.log("==============================================\n");
}

runBatchCrops().catch((err) => {
  console.error("Fatal batch script error:", err);
  process.exit(1);
});
