import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateImageEmbedding } from "./embeddingService";
import path from "path";
import os from "os";
import fs from "fs/promises";

/**
 * Enqueues a symbol crop for background embedding generation.
 */
export async function enqueueCrop(cropId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  await admin.from("embedding_jobs").insert({
    crop_id: cropId,
    status: "pending"
  });
}

/**
 * Processes up to 20 pending embedding jobs sequentially.
 * Downloads the crops from Storage, computes embeddings, and updates the database.
 */
export async function processQueue(): Promise<number> {
  const admin = getSupabaseAdminClient();

  const { data: jobs, error: jobsErr } = await admin
    .from("embedding_jobs")
    .select(`
      id,
      crop_id,
      status,
      symbol_crops (
        image_path
      )
    `)
    .eq("status", "pending")
    .limit(20);

  if (jobsErr || !jobs || jobs.length === 0) {
    return 0;
  }

  let processed = 0;
  for (const job of jobs) {
    // 1. Mark as processing
    await admin
      .from("embedding_jobs")
      .update({
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    const cropsRel = job.symbol_crops as any;
    const imagePath = cropsRel?.image_path;

    if (!imagePath) {
      await admin
        .from("embedding_jobs")
        .update({
          status: "failed",
          error_message: "Crop image path not found in symbol_crops relationship",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      continue;
    }

    try {
      // 2. Download the PNG crop from symbol-crops bucket
      const { data: fileBlob, error: dlErr } = await admin.storage
        .from("symbol-crops")
        .download(imagePath);

      if (dlErr || !fileBlob) {
        throw new Error(`Failed to download crop image from storage: ${dlErr?.message}`);
      }

      const tempPath = path.join(os.tmpdir(), `queue_embed_${job.crop_id}.png`);
      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      await fs.writeFile(tempPath, buffer);

      // 3. Compute the L2-normalized embedding
      const vector = await generateImageEmbedding(tempPath);
      await fs.unlink(tempPath).catch(() => {});

      // 4. Update the crop record
      const { error: updErr } = await admin
        .from("symbol_crops")
        .update({
          embedding: vector,
          embedding_status: "completed"
        })
        .eq("id", job.crop_id);

      if (updErr) {
        throw updErr;
      }

      // 5. Mark job as completed
      await admin
        .from("embedding_jobs")
        .update({
          status: "completed",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      processed++;
    } catch (err: any) {
      console.error(`[EmbeddingQueue] Job ${job.id} failed:`, err.message);
      await admin
        .from("embedding_jobs")
        .update({
          status: "failed",
          error_message: err.message,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      await admin
        .from("symbol_crops")
        .update({
          embedding_status: "failed"
        })
        .eq("id", job.crop_id);
    }
  }

  return processed;
}
