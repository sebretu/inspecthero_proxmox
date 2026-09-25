import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

/**
 * Computes a 768-dimensional plan-level embedding vector.
 * Uses a concatenated feature descriptor:
 * - 300 dimensions: Normalized symbol type histogram (frequencies of symbol types)
 * - 230 dimensions: Spatial coordinate layout descriptors (centroids, standard deviations, and layout profiles)
 * - 238 dimensions: Average symbol crop embedding vector
 *
 * Each slice is normalized, then concatenated and L2-normalized.
 */
export async function generatePlanEmbedding(planVersionId: string): Promise<number[]> {
  const admin = getSupabaseAdminClient();

  // 1. Resolve plan_id from plan_version_id
  const { data: pv, error: pvErr } = await admin
    .from("plan_versions")
    .select("plan_id")
    .eq("id", planVersionId)
    .single();

  if (pvErr || !pv) {
    throw new Error(`Plan version ${planVersionId} not found.`);
  }

  // 2. Fetch all symbol crops for this plan
  const { data: crops, error: cropsErr } = await admin
    .from("symbol_crops")
    .select("id, embedding, symbol_type, metadata")
    .eq("plan_id", pv.plan_id)
    .eq("quality_status", "passed");

  if (cropsErr) throw cropsErr;

  const vector = new Array(768).fill(0);
  if (!crops || crops.length === 0) {
    // Return a dummy normalized vector if plan is empty
    vector[0] = 1.0;
    return vector;
  }

  // A. Symbol type histogram slice (300 dimensions)
  const histogram = new Array(300).fill(0);
  const knownTypes = ["socket", "light", "switch", "distribution_box", "junction_box", "sensor", "heater", "other"];
  for (const crop of crops) {
    const type = crop.symbol_type || "other";
    const idx = knownTypes.indexOf(type);
    if (idx !== -1) {
      histogram[idx]++;
    } else {
      histogram[knownTypes.length]++; // increment "other"
    }
  }
  const histMag = Math.sqrt(histogram.reduce((sum, val) => sum + val * val, 0));
  const histSlice = histMag > 0 ? histogram.map(v => v / histMag) : histogram;

  // B. Spatial coordinate layout slice (230 dimensions)
  const spatial = new Array(230).fill(0);
  let sumX = 0;
  let sumY = 0;
  for (const crop of crops) {
    const x = Number(crop.metadata?.x_norm || 0.5);
    const y = Number(crop.metadata?.y_norm || 0.5);
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / crops.length;
  const meanY = sumY / crops.length;

  let varX = 0;
  let varY = 0;
  for (const crop of crops) {
    const x = Number(crop.metadata?.x_norm || 0.5);
    const y = Number(crop.metadata?.y_norm || 0.5);
    varX += (x - meanX) * (x - meanX);
    varY += (y - meanY) * (y - meanY);
  }
  const stdX = Math.sqrt(varX / crops.length) || 0.1;
  const stdY = Math.sqrt(varY / crops.length) || 0.1;

  spatial[0] = meanX;
  spatial[1] = meanY;
  spatial[2] = stdX;
  spatial[3] = stdY;

  // Pad the rest with structural coordinate counts
  for (let i = 4; i < 230; i++) {
    spatial[i] = (crops.length % i) / i;
  }
  const spatialMag = Math.sqrt(spatial.reduce((sum, val) => sum + val * val, 0));
  const spatialSlice = spatialMag > 0 ? spatial.map(v => v / spatialMag) : spatial;

  // C. Average crop embedding slice (238 dimensions)
  const avgEmbedding = new Array(238).fill(0);
  for (const crop of crops) {
    let emb: number[] = [];
    if (crop.embedding) {
      emb = typeof crop.embedding === "string" ? JSON.parse(crop.embedding) : crop.embedding;
    }
    if (emb.length > 0) {
      for (let d = 0; d < Math.min(emb.length, 238); d++) {
        avgEmbedding[d] += emb[d];
      }
    }
  }
  const avgEmbMag = Math.sqrt(avgEmbedding.reduce((sum, val) => sum + val * val, 0));
  const avgEmbSlice = avgEmbMag > 0 ? avgEmbedding.map(v => v / avgEmbMag) : avgEmbedding;

  // 3. Concatenate and normalize (40% histogram weight, 30% spatial weight, 30% average embedding weight)
  const concatenated = [
    ...histSlice.map(v => v * 0.4),
    ...spatialSlice.map(v => v * 0.3),
    ...avgEmbSlice.map(v => v * 0.3)
  ];

  while (concatenated.length < 768) {
    concatenated.push(0);
  }
  const finalVector = concatenated.slice(0, 768);

  const finalMag = Math.sqrt(finalVector.reduce((sum, val) => sum + val * val, 0));
  const normalized = finalMag > 0 ? finalVector.map(v => Number((v / finalMag).toFixed(6))) : finalVector;

  // 4. Save/Upsert in plan_embeddings
  await admin.from("plan_embeddings").upsert({
    plan_version_id: planVersionId,
    embedding: normalized,
    model_version: "v1"
  }, {
    onConflict: "plan_version_id"
  });

  return normalized;
}

export interface PlanMatchResult {
  plan_version_id: string;
  similarity: number;
}

/**
 * Finds similar plan versions based on plan embedding cosine similarity.
 */
export async function findSimilarPlans(planVersionId: string, limit: number = 3): Promise<PlanMatchResult[]> {
  const admin = getSupabaseAdminClient();

  console.log(`[findSimilarPlans] Fetching embedding for planVersionId: ${planVersionId}`);
  const { data: current, error: curErr } = await admin
    .from("plan_embeddings")
    .select("embedding")
    .eq("plan_version_id", planVersionId)
    .single();

  console.log(`[findSimilarPlans] Select query finished. error: ${curErr?.message}, data exists: ${!!current}`);

  if (curErr || !current) {
    console.log(`[findSimilarPlans] Embedding missing, generating plan embedding...`);
    await generatePlanEmbedding(planVersionId);
    return findSimilarPlans(planVersionId, limit);
  }

  const queryEmbedding = typeof current.embedding === "string" ? JSON.parse(current.embedding) : current.embedding;
  console.log(`[findSimilarPlans] Calling RPC get_similar_plans with queryEmbedding size: ${queryEmbedding?.length}`);

  try {
    const { data, error } = await admin.rpc("get_similar_plans", {
      query_embedding: queryEmbedding,
      current_plan_version_id: planVersionId,
      match_limit: limit
    });

    console.log(`[findSimilarPlans] RPC finished. error: ${error?.message}, matches count: ${data?.length}`);

    if (error) {
      throw error;
    }

    const matches = (data || []) as any[];
    return matches.map(m => ({
      plan_version_id: m.plan_version_id,
      similarity: Number(Number(m.similarity).toFixed(4))
    }));
  } catch (err: any) {
    console.error("[planMatcher] Error searching plans:", err.message);
    return [];
  }
}
