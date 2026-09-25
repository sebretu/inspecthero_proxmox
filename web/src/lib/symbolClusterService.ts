import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export interface ClusterProvider {
  cluster(embeddings: number[][], threshold: number): Promise<number[]>;
}

/**
 * Standard Leader Clustering algorithm using Cosine Similarity.
 * Assigns each vector to the closest cluster if similarity >= threshold,
 * otherwise spawns a new cluster center.
 */
export class LeaderClusterProvider implements ClusterProvider {
  async cluster(embeddings: number[][], threshold: number = 0.90): Promise<number[]> {
    const clusterIndices: number[] = new Array(embeddings.length).fill(-1);
    const clusterCenters: number[][] = [];

    const dotProduct = (v1: number[], v2: number[]) => {
      let sum = 0;
      for (let i = 0; i < v1.length; i++) {
        sum += v1[i] * v2[i];
      }
      return sum;
    };

    for (let i = 0; i < embeddings.length; i++) {
      const v = embeddings[i];
      let bestClusterIdx = -1;
      let highestSim = -1;

      // Find the closest existing cluster center
      for (let c = 0; c < clusterCenters.length; c++) {
        const center = clusterCenters[c];
        const sim = dotProduct(v, center);
        if (sim > highestSim) {
          highestSim = sim;
          bestClusterIdx = c;
        }
      }

      if (highestSim >= threshold) {
        clusterIndices[i] = bestClusterIdx;
        
        // Update center of the cluster (incremental running average)
        const membersCount = clusterIndices.filter(idx => idx === bestClusterIdx).length;
        for (let d = 0; d < v.length; d++) {
          clusterCenters[bestClusterIdx][d] = (clusterCenters[bestClusterIdx][d] * (membersCount - 1) + v[d]) / membersCount;
        }
        
        // Re-normalize updated center vector
        const mag = Math.sqrt(clusterCenters[bestClusterIdx].reduce((sum, val) => sum + val * val, 0));
        if (mag > 0) {
          clusterCenters[bestClusterIdx] = clusterCenters[bestClusterIdx].map(x => x / mag);
        }
      } else {
        // Spawn a new cluster
        clusterCenters.push([...v]);
        clusterIndices[i] = clusterCenters.length - 1;
      }
    }

    return clusterIndices;
  }
}

interface ClusterStats {
  totalCrops: number;
  totalClusters: number;
  outliersCount: number;
  mislabeledCount: number;
}

/**
 * Runs symbol crops clustering using the Leader provider.
 * Writes results to symbol_clusters and symbol_crops.
 */
export async function clusterSymbols(
  provider: ClusterProvider = new LeaderClusterProvider(),
  threshold: number = 0.90
): Promise<ClusterStats> {
  const admin = getSupabaseAdminClient();

  // 1. Fetch passed crops
  const { data: crops, error } = await admin
    .from("symbol_crops")
    .select("id, embedding, symbol_type")
    .eq("quality_status", "passed")
    .not("embedding", "is", null);

  if (error) throw error;
  if (!crops || crops.length === 0) {
    return { totalCrops: 0, totalClusters: 0, outliersCount: 0, mislabeledCount: 0 };
  }

  // Parse embeddings from DB (pgvector outputs them as string format sometimes e.g. "[0.1,0.2]")
  const parsedEmbeddings: number[][] = crops.map(c => {
    if (typeof c.embedding === "string") {
      return JSON.parse(c.embedding);
    }
    return c.embedding as number[];
  });

  // 2. Perform clustering
  const clusterIndices = await provider.cluster(parsedEmbeddings, threshold);

  // Group crops by cluster index
  const clustersMap = new Map<number, typeof crops>();
  for (let i = 0; i < crops.length; i++) {
    const cIdx = clusterIndices[i];
    if (!clustersMap.has(cIdx)) {
      clustersMap.set(cIdx, []);
    }
    clustersMap.get(cIdx)!.push(crops[i]);
  }

  // 3. Clear previous clusters
  await admin.from("symbol_clusters").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  let outliersCount = 0;
  let mislabeledCount = 0;

  // 4. Save clusters and map crops
  for (const [cIdx, memberCrops] of clustersMap.entries()) {
    const clusterId = crypto.randomUUID();
    const size = memberCrops.length;

    // Compute Centroid vector
    const sumVector = new Array(768).fill(0);
    for (const m of memberCrops) {
      const idx = crops.findIndex(c => c.id === m.id);
      const v = parsedEmbeddings[idx];
      for (let d = 0; d < 768; d++) {
        sumVector[d] += v[d];
      }
    }
    
    const rawCentroid = sumVector.map(x => x / size);
    const mag = Math.sqrt(rawCentroid.reduce((sum, val) => sum + val * val, 0));
    const centroid = mag > 0 ? rawCentroid.map(x => Number((x / mag).toFixed(6))) : rawCentroid;

    // Determine majority type
    const typeCounts: Record<string, number> = {};
    for (const m of memberCrops) {
      typeCounts[m.symbol_type] = (typeCounts[m.symbol_type] || 0) + 1;
    }
    
    let majorityType = "unknown";
    let maxCount = 0;
    for (const [t, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityType = t;
      }
    }

    // Insert Cluster record
    const { error: insErr } = await admin.from("symbol_clusters").insert({
      id: clusterId,
      centroid,
      size,
      majority_symbol_type: majorityType,
      model_version: "v1"
    });

    if (insErr) throw insErr;

    // Associate member crops to this cluster
    const memberIds = memberCrops.map(m => m.id);
    const { error: updErr } = await admin
      .from("symbol_crops")
      .update({ cluster_id: clusterId })
      .in("id", memberIds);

    if (updErr) throw updErr;

    // Count outliers & mislabeled items
    if (size === 1) {
      outliersCount++;
    }

    for (const m of memberCrops) {
      if (m.symbol_type !== majorityType) {
        mislabeledCount++;
      }
    }
  }

  return {
    totalCrops: crops.length,
    totalClusters: clustersMap.size,
    outliersCount,
    mislabeledCount
  };
}
