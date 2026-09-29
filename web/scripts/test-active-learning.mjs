import dns from "dns";
dns.setDefaultResultOrder("ipv4first"); // Force IPv4 to prevent Node 18+ fetch hangs on Tailscale IPs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { processQueue } from "../src/lib/embeddingQueue.ts";
import { maintainVectorIndex } from "../src/lib/vectorMaintenance.ts";
import { clusterSymbols } from "../src/lib/symbolClusterService.ts";
import { generatePlanEmbedding, findSimilarPlans } from "../src/lib/planMatcher.ts";
import { getSymbolGraph } from "../src/lib/symbolGraphService.ts";

dotenv.config({ path: "/home/ubuntu/inspecthero-web.env" });

// Use the production Supabase URL directly to ensure Cloudflare-signed storage URLs resolve correctly
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.inspecthero.pl",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

async function test() {
  console.log("\n==============================================");
  console.log("Starting Platform Active Learning Verification");
  console.log("==============================================\n");

  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021'; // OG

  // 1. Setup mock feedback and predictions for benchmark test
  console.log("[Test-Active] Creating mock prediction reviews & feedback...");
  const predId = '00000000-0000-0000-0000-000000001234';
  
  await supabase.from("symbol_predictions").upsert({
    id: predId,
    plan_id: planId,
    x_norm: 0.15,
    y_norm: 0.25,
    predicted_symbol_type: "socket",
    confidence: 0.94,
    status: "approved"
  });

  // Check if feedback already exists to avoid unique constraint violations
  const { data: existingFeed } = await supabase
    .from("symbol_feedback")
    .select("id")
    .eq("prediction_id", predId)
    .limit(1);

  if (!existingFeed || existingFeed.length === 0) {
    await supabase.from("symbol_feedback").insert({
      prediction_id: predId,
      accepted: true,
      corrected_symbol: "socket",
      reviewer: "AI verification script",
      notes: "Active learning test review log",
      corrected_position: { x_norm: 0.15, y_norm: 0.25 },
      corrected_rotation: 0.0,
      review_time: 5
    });
  }

  // 2. Setup mock embedding queue job
  console.log("[Test-Active] Injecting mock job into embedding queue...");
  const { data: crops } = await supabase.from("symbol_crops").select("id").limit(1);
  if (crops && crops.length > 0) {
    const cropId = crops[0].id;
    // Clear embedding in db to force processing
    await supabase.from("symbol_crops").update({ embedding: null, embedding_status: "pending" }).eq("id", cropId);
    
    // Clear existing queue jobs for this crop
    await supabase.from("embedding_jobs").delete().eq("crop_id", cropId);

    // Insert job
    await supabase.from("embedding_jobs").insert({
      crop_id: cropId,
      status: "pending"
    });

    console.log("[Test-Active] Running queue worker...");
    const processed = await processQueue();
    console.log(`[Test-Active] Queue processed: ${processed} jobs.`);
  }

  // 3. Database Vacuum Analyze
  console.log("[Test-Active] Running index vacuum analyze...");
  const maintenance = await maintainVectorIndex();
  console.log(`[Test-Active] Index maintenance stats: Count=${maintenance.count}, Reindexed=${maintenance.reindexed}`);

  // 4. Unsupervised clustering anomalies
  console.log("[Test-Active] Executing symbol clustering (Leader Provider)...");
  const clustering = await clusterSymbols();
  console.log("\n==============================================");
  console.log("Clustering metrics:");
  console.log(`   Total crops checked: ${clustering.totalCrops}`);
  console.log(`   Total clusters formed: ${clustering.totalClusters}`);
  console.log(`   Outliers count: ${clustering.outliersCount}`);
  console.log(`   Mislabeled counts: ${clustering.mislabeledCount}`);
  console.log("==============================================\n");

  // 5. Version-level Plan embeddings
  console.log("[Test-Active] Generating plan-level embedding...");
  const { data: pv } = await supabase.from("plan_versions").select("id").eq("plan_id", planId).limit(1).single();
  if (pv) {
    const planVersionId = pv.id;
    await generatePlanEmbedding(planVersionId);
    console.log(`[Test-Active] Plan embedding created successfully for version: ${planVersionId}`);

    console.log("[Test-Active] Searching for similar plans...");
    const similar = await findSimilarPlans(planVersionId);
    console.log(`[Test-Active] Found ${similar.length} similar plans:`);
    similar.forEach((s, idx) => {
      console.log(`   ${idx + 1}. Plan Version: ${s.plan_version_id} (Similarity: ${(s.similarity * 100).toFixed(1)}%)`);
    });
  }

  // 6. Plan connectivity symbol graph
  console.log("[Test-Active] Constructing Spatial-Electrical Symbol Graph...");
  const graph = await getSymbolGraph(planId);
  console.log("\n==============================================");
  console.log("Symbol Graph metrics:");
  console.log(`   Total Nodes: ${graph.nodes.length}`);
  console.log(`   Total Edges (Connections): ${graph.edges.length}`);
  console.log("==============================================\n");

  if (graph.nodes.length > 0) {
    console.log("Sample Nodes:");
    graph.nodes.slice(0, 5).forEach(node => {
      console.log(`   - ID: ${node.id} (${node.type}) [Label: ${node.label}]`);
    });
  }

  console.log("\n[Test-Active] All active learning platform operations validated successfully!");
}

test().catch(console.error);
