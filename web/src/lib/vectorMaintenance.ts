import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

/**
 * Optimizes pgvector index health.
 * Triggers analyze and potential index reindexing directly in the database.
 */
export async function maintainVectorIndex(): Promise<{ success: boolean; reindexed: boolean; count: number }> {
  const admin = getSupabaseAdminClient();

  try {
    const { data, error } = await admin.rpc("maintain_vector_idx");

    if (error) {
      throw error;
    }

    const res = data as { count: number; reindexed: boolean; success: boolean };
    return {
      success: res.success,
      reindexed: res.reindexed,
      count: res.count
    };
  } catch (err: any) {
    console.error("[vectorMaintenance] Index maintenance failed:", err.message);
    return {
      success: false,
      reindexed: false,
      count: 0
    };
  }
}
