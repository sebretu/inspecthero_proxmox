import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateSymbolCrop } from "@/lib/symbolCropper";
import { generateImageEmbedding } from "@/lib/embeddingService";
import path from "path";
import os from "os";
import fs from "fs/promises";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { prediction_id, action } = req.body;
  if (!prediction_id || !action) {
    return res.status(400).json({ error: "Missing prediction_id or action parameters" });
  }

  const admin = getSupabaseAdminClient();

  try {
    if (action === "reject") {
      // Fetch the prediction to get crop_path and plan_id for negative learning record
      const { data: rejPred } = await admin
        .from("symbol_predictions")
        .select("id, plan_id, x_norm, y_norm, crop_path, metadata")
        .eq("id", prediction_id)
        .maybeSingle();

      const { error: updErr } = await admin
        .from("symbol_predictions")
        .update({ status: "rejected" })
        .eq("id", prediction_id);

      if (updErr) throw updErr;

      // Global Negative Learning: save this rejected crop as a failed pattern
      if (rejPred?.crop_path) {
        try {
          const { generateImageEmbeddingFromStoragePath } = await import("@/lib/embeddingService");
          const embedding = await generateImageEmbeddingFromStoragePath(rejPred.crop_path);

          const { error: cropErr } = await admin.from("symbol_crops").insert({
            id: crypto.randomUUID(),
            plan_id: rejPred.plan_id,
            x_norm: rejPred.x_norm,
            y_norm: rejPred.y_norm,
            image_path: rejPred.crop_path,
            symbol_type: "rejected_negative",
            quality_status: "failed",
            embedding,
            source: "negative_learning",
            metadata: { origin: "prediction_rejection", prediction_id }
          });
          if (cropErr) console.error("[approve] Failed to insert rejected crop:", cropErr.message);
        } catch (embErr: any) {
          // If embedding generation fails, still save record without embedding
          const { error: cropErr } = await admin.from("symbol_crops").insert({
            id: crypto.randomUUID(),
            plan_id: rejPred.plan_id,
            x_norm: rejPred.x_norm,
            y_norm: rejPred.y_norm,
            image_path: rejPred.crop_path,
            symbol_type: "rejected_negative",
            quality_status: "failed",
            source: "negative_learning",
            metadata: { origin: "prediction_rejection", prediction_id }
          });
          if (cropErr) console.error("[approve] Failed to insert rejected crop without embedding:", cropErr.message);
        }
      }

      return res.status(200).json({ ok: true, data: { ok: true, status: "rejected" } });
    }

    if (action !== "approve") {
      return res.status(400).json({ error: "Invalid action parameter" });
    }

    // --- APPROVAL WORKFLOW ---
    // 1. Fetch prediction
    const { data: pred, error: predErr } = await admin
      .from("symbol_predictions")
      .select("*")
      .eq("id", prediction_id)
      .single();

    if (predErr || !pred) {
      return res.status(404).json({ error: `Prediction ${prediction_id} not found.` });
    }

    // 2. Fetch reference crop metadata if available
    let matchedCrop: any = null;
    if (pred.matched_crop_id) {
      const { data: c } = await admin
        .from("symbol_crops")
        .select("*")
        .eq("id", pred.matched_crop_id)
        .single();
      matchedCrop = c;
    }

    // 3. Create Stromkreis Marker
    const symbolType = pred.predicted_symbol_type || matchedCrop?.symbol_type || "socket";
    const isSocket = symbolType.toLowerCase().includes("socket") || symbolType.toLowerCase().includes("gniazdo");
    const defaultCable = isSocket ? "NYM-J 3x2.5" : "NYM-J 3x1.5";

    const breaker = matchedCrop?.metadata?.breaker_current || "16A";
    const phase = matchedCrop?.metadata?.phase || "L1";
    const cable = matchedCrop?.metadata?.kabeltyp || defaultCable;

    const markerMetadata = {
      executions: {
        "ai_approval": {
          status: "APPROVED",
          submitted_by: "AI Detector",
          submitted_at: new Date().toISOString()
        }
      },
      realType: pred.predicted_symbol_type,
      kabeltyp: cable,
      breaker_current: breaker,
      breaker_curve: matchedCrop?.metadata?.breaker_curve || "B",
      phase: phase
    };

    const { data: newMarker, error: markerErr } = await admin
      .from("stromkreise")
      .insert({
        plan_id: pred.plan_id,
        symbol_type: pred.predicted_symbol_type,
        circuit_code: matchedCrop?.clip_prompt?.circuit_code || matchedCrop?.metadata?.circuit_code || "AI-TEMP",
        breaker_current: parseInt(breaker, 10) || 16,
        breaker_curve: matchedCrop?.metadata?.breaker_curve || "B",
        phase: phase === "L1/L2/L3" ? 3 : 1,
        kabeltyp: cable,
        x_norm: pred.x_norm,
        y_norm: pred.y_norm,
        metadata: markerMetadata
      })
      .select("id")
      .single();

    if (markerErr || !newMarker) {
      throw new Error(`Failed to create stromkreis marker: ${markerErr?.message}`);
    }

    // 4. Update prediction status to approved
    await admin
      .from("symbol_predictions")
      .update({ status: "approved" })
      .eq("id", prediction_id);

    // 5. Generate Symbol Crop in symbol_crops
    console.log(`[Approve API] Generating crop variants for approved marker ${newMarker.id}`);
    await generateSymbolCrop(newMarker.id);

    // 6. Update symbol_crops entry with AI metadata and generate vector embedding
    const { data: symbolCrop } = await admin
      .from("symbol_crops")
      .select("id, image_path, metadata")
      .eq("stromkreis_id", newMarker.id)
      .single();

    if (symbolCrop) {
      const feedbackMetadata = {
        ...(symbolCrop.metadata || {}),
        source: "AI_verified",
        confidence: pred.confidence,
        original_prediction: true
      };

      // Generate embedding vector locally from the 256px crop
      const { data: fileBlob } = await admin.storage
        .from("symbol-crops")
        .download(symbolCrop.image_path);

      let vector: number[] | null = null;
      if (fileBlob) {
        const tempPath = path.join(os.tmpdir(), `ai_embed_${newMarker.id}.png`);
        try {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          await fs.writeFile(tempPath, buffer);
          vector = await generateImageEmbedding(tempPath);
        } catch (e: any) {
          console.error(`[Approve API] Embedding computation failed:`, e.message);
        } finally {
          await fs.unlink(tempPath).catch(() => {});
        }
      }

      const { error: updCropErr } = await admin
        .from("symbol_crops")
        .update({
          metadata: feedbackMetadata,
          quality_status: "passed",
          quality_score: pred.confidence,
          ...(vector ? { embedding: vector, embedding_status: "completed" } : {})
        })
        .eq("id", symbolCrop.id);

      if (updCropErr) {
        console.error(`[Approve API] Failed to update symbol_crops metadata:`, updCropErr.message);
      }
    }

    return res.status(200).json({ ok: true, data: { ok: true, status: "approved", marker_id: newMarker.id } });
  } catch (err: any) {
    console.error("[Approve Prediction] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
