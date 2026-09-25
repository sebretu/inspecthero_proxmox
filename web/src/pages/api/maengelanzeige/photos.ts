import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: any;
  let userId: string | null = null;
  try {
    const result = createServerSupabaseClient(req);
    supabase = result.client;
    userId = result.userId;
    if (!userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  } catch {
    return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
  }

  const admin = getSupabaseAdminClient();

  // POST: Upload a photo for a Mangel item
  if (req.method === "POST") {
    const { itemId, imageBase64, fileName, caption, photoType } = req.body || {};

    if (!itemId || !imageBase64) {
      return res.status(400).json({ ok: false, error: { message: "Missing itemId or imageBase64" } });
    }

    try {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(cleanBase64, "base64");
      const ext = (fileName || "").toLowerCase().endsWith(".png") ? "png" : "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const storagePath = `${itemId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from("maengelanzeige-photos")
        .upload(storagePath, buf, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.warn("[Mängelanzeige Photo] Upload warning:", uploadError.message);
      }

      const supabaseBaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://api.et4u.de").replace(/\/$/, "");
      const url = `${supabaseBaseUrl}/storage/v1/object/public/maengelanzeige-photos/${storagePath}`;

      const photoTypeValue = photoType === "AFTER" ? "AFTER" : "BEFORE";
      const prefix = photoTypeValue === "BEFORE" ? "[VORHER]" : "[NACHHER]";
      const rawCaption = (caption || "").replace(/^\[(VORHER|NACHHER)\]\s*/, "").trim();
      const taggedCaption = rawCaption ? `${prefix} ${rawCaption}` : prefix;

      let insertPayload: Record<string, any> = {
        item_id: itemId,
        storage_bucket: "maengelanzeige-photos",
        storage_path: storagePath,
        url,
        caption: taggedCaption,
        photo_type: photoTypeValue,
        uploaded_by: userId,
      };

      let { data: photo, error: dbError } = await admin
        .from("maengelanzeige_photos")
        .insert(insertPayload)
        .select()
        .single();

      if (dbError && dbError.message?.includes("column")) {
        delete insertPayload.photo_type;
        const retry = await admin
          .from("maengelanzeige_photos")
          .insert(insertPayload)
          .select()
          .single();
        photo = retry.data;
        dbError = retry.error;
      }

      if (dbError) throw dbError;

      // Automatically mark item as selected for the report when a photo is added
      try {
        await admin
          .from("maengelanzeige_items")
          .update({ is_selected: true, updated_at: new Date().toISOString() })
          .eq("id", itemId);
      } catch {}

      return res.status(200).json({ ok: true, data: { ...photo, photo_type: photoTypeValue } });
    } catch (err: any) {
      console.error("[Mängelanzeige Photo Upload Error]:", err);
      return res.status(500).json({ ok: false, error: { message: err.message || "Failed to upload photo" } });
    }
  }

  // DELETE: Delete photo
  if (req.method === "DELETE") {
    const photoId = String(req.query.id || req.body?.id || "").trim();
    if (!photoId) {
      return res.status(400).json({ ok: false, error: { message: "Missing photo id" } });
    }

    try {
      // Check user role
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const userRole = (profile?.role || "").toUpperCase();
      const isAdmin = userRole === "ADMIN" || userRole === "MODERATOR";

      const { data: photo } = await admin
        .from("maengelanzeige_photos")
        .select("storage_bucket, storage_path, uploaded_by")
        .eq("id", photoId)
        .single();

      if (!photo) {
        return res.status(404).json({ ok: false, error: { message: "Photo not found" } });
      }

      // If not admin, user can only delete their own uploaded photos
      if (!isAdmin && photo.uploaded_by && photo.uploaded_by !== userId) {
        return res.status(403).json({ ok: false, error: { message: "Sie können nur eigene Fotos löschen." } });
      }

      if (photo.storage_path) {
        await admin.storage
          .from(photo.storage_bucket || "maengelanzeige-photos")
          .remove([photo.storage_path])
          .catch(() => {});
      }

      const { error } = await admin.from("maengelanzeige_photos").delete().eq("id", photoId);
      if (error) throw error;

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  // PATCH: Update caption or photo_type
  if (req.method === "PATCH") {
    const { id, caption, ai_suggested_caption, photo_type } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, error: { message: "Missing photo id" } });
    }

    try {
      const { data: existingPhoto } = await admin
        .from("maengelanzeige_photos")
        .select("caption, photo_type")
        .eq("id", id)
        .maybeSingle();

      const targetType = photo_type || (existingPhoto?.photo_type === "BEFORE" || existingPhoto?.caption?.startsWith("[VORHER]") ? "BEFORE" : "AFTER");
      const targetPrefix = targetType === "BEFORE" ? "[VORHER]" : "[NACHHER]";

      const updates: Record<string, any> = {};
      if (typeof photo_type === "string") {
        updates.photo_type = photo_type;
      }

      if (typeof caption !== "undefined") {
        const cleanCap = (caption || "").replace(/^\[(VORHER|NACHHER)\]\s*/, "").trim();
        updates.caption = cleanCap ? `${targetPrefix} ${cleanCap}` : targetPrefix;
      } else if (typeof photo_type === "string") {
        const cleanCap = (existingPhoto?.caption || "").replace(/^\[(VORHER|NACHHER)\]\s*/, "").trim();
        updates.caption = cleanCap ? `${targetPrefix} ${cleanCap}` : targetPrefix;
      }

      if (typeof ai_suggested_caption !== "undefined") {
        updates.ai_suggested_caption = ai_suggested_caption;
      }

      let { data, error } = await admin
        .from("maengelanzeige_photos")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error && error.message?.includes("column")) {
        delete updates.photo_type;
        const retry = await admin
          .from("maengelanzeige_photos")
          .update(updates)
          .eq("id", id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      return res.status(200).json({ ok: true, data: { ...data, photo_type: targetType } });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { message: err.message } });
    }
  }

  res.setHeader("Allow", ["POST", "DELETE", "PATCH"]);
  return res.status(405).json({ ok: false, error: { message: "Method Not Allowed" } });
}
