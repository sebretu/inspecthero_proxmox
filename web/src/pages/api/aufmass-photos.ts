import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

// ✅ NEW: podnieś limit body (base64 z iPhone robi się ogromne)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string, meta?: any) {
  return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message, meta } });
}

function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
  return res.status(error?.status || 400).json({
    ok: false,
    error: {
      code: "SUPABASE",
      message: error?.message || "supabase error",
      meta: { code: error?.code, details: error?.details },
    },
  });
}

type PhotoType = "BEFORE" | "AFTER";

function normalizePhotoType(input: any): PhotoType | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toUpperCase();
  if (value === "BEFORE" || value === "AFTER") return value;
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isAdmin = isAdminRole(requester.role);

  async function getSessionAssignment(sessionId: string): Promise<{ created_by: string | null } | null> {
    const { data, error } = await supabase
      .from("aufmass_sessions")
      .select("created_by")
      .eq("id", sessionId)
      .single();

    if (error) {
      throw {
        status: (error as any).status || 400,
        code: (error as any).code || "SUPABASE",
        message: error.message,
        meta: { code: (error as any).code, details: (error as any).details },
      };
    }

    return data ?? null;
  }

  async function assertCanManagePhotos(sessionId: string) {
    if (isAdmin) return;
    const sessionParams = await getSessionAssignment(sessionId);
    if (!sessionParams) return;

    if (sessionParams.created_by === requester.id) return;

    throw { status: 403, code: "FORBIDDEN", message: "Only the creator or an admin may modify aufmass photos" };
  }

  // ------------------------
  // GET /api/aufmass-photos?sessionId=...
  // ------------------------
  if (req.method === "GET") {
    const sessionId = String(req.query.sessionId || "").trim();
    if (!sessionId) return bad(res, "Missing query: sessionId");

    const rawPhase = typeof req.query.phase === "string" ? req.query.phase : typeof req.query.photoType === "string" ? req.query.photoType : "";
    const phase = normalizePhotoType(rawPhase);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : null;

    try {
      await getSessionAssignment(sessionId);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    // Use admin client to bypass RLS — auth is already checked above via getTaskAssignment
    const adminClient = getSupabaseAdminClient();
    let query = adminClient
      .from("aufmass_photos")
      .select("*, profiles!created_by(role)")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (phase) {
      query = query.eq("photo_type", phase);
    }
    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) return supaErr(res, error);


    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  // POST /api/aufmass-photos
  // body: { session_id, file_name, caption?, base64 }
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const session_id = String(body?.session_id || "").trim();
    const uploaded_by = userId; // auth.uid() z JWT
    const file_name = String(body?.file_name || "").trim() || "photo.jpg";
    const caption = body?.caption == null ? null : String(body.caption);
    const rawPhotoType = body?.photo_type ?? body?.photoType;
    const photo_type = normalizePhotoType(rawPhotoType) || "BEFORE";
    const base64 = String(body?.base64 || "").trim();

    if (!session_id) return bad(res, "Missing session_id");
    if (!uploaded_by) return bad(res, "Cannot determine user from token");
    if (!base64) return bad(res, "Missing base64");
    if (!photo_type) return bad(res, "Invalid photo_type");

    try {
      await assertCanManagePhotos(session_id);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    // base64 może przyjść jako data:image/...;base64,....
    const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;

    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return bad(res, "Invalid base64");
    }

    // Bucket zgodny z DB defaultem:
    const bucket = "aufmass-photos";

    // Ścieżka: session_id/yyyymmdd-hhmmss-rand-filename
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const storage_path = `${session_id}/${stamp}-${rand}-${safeName}`;

    // MIME: najlepiej po stronie klienta, ale tu spróbujemy zgadnąć z nazwy jeśli nie ma
    // (w DB i tak trzymasz url + storage_path)
    const ext = safeName.toLowerCase().split(".").pop() || "";
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : ext === "heic" || ext === "heif" // ✅ NEW: iPhone często daje HEIC/HEIF
              ? "image/heic"
              : "image/jpeg";

    // Public URL (bucket public)
    // Choose NEXT_PUBLIC_SUPABASE_URL when available. For local dev, avoid
    // generating URLs that point at localhost/127.0.0.1 — rewrite to the
    // developer-facing host so clients can fetch the image.
    let PUBLIC_SUPABASE_URL =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");



    const publicUrl = PUBLIC_SUPABASE_URL ? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storage_path}` : null;

    if (!publicUrl) return bad(res, "Failed to create public URL");

    // Upload do Storage — use admin client to bypass storage RLS
    const adminForUpload = getSupabaseAdminClient();
    const uploadResult = await adminForUpload.storage.from(bucket).upload(storage_path, buf, {
      upsert: false,
      contentType,
      cacheControl: "3600",
    });

    if (uploadResult.error) {
      return supaErr(res, uploadResult.error);
    }

    // Wywołanie Edge Function generate-thumbnail (z timeoutem 4s, żeby nie wieszać całego uploadu)
    let thumbUrl = null;
    let thumbUrlWebp = null;
    try {
      const edgeFunctionUrl = process.env.GENERATE_THUMBNAIL_EDGE_URL || "https://phvtrpskgupxkktbznac.functions.supabase.co/generate-thumbnail";
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const efResp = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_ANON_KEY || "your-anon-key-here"
        },
        body: JSON.stringify({ imagePath: storage_path }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (efResp.ok) {
        const efJson = await efResp.json();
        thumbUrl = efJson.thumbUrl || null;
        thumbUrlWebp = efJson.thumbUrlWebp || null;
      }
    } catch (e) {
      console.warn("Edge Function thumbnail error or timeout", e);
    }

    // Use admin client to bypass RLS for insert
    const adminForInsert = getSupabaseAdminClient();
    const inserted = await (adminForInsert as any)
      .from("aufmass_photos")
      .insert({
        session_id,
        created_by: uploaded_by,
        caption,
        url: publicUrl,
        thumb_url: thumbUrl,
        thumb_url_webp: thumbUrlWebp,
        storage_bucket: bucket,
        storage_path,
        photo_type,
      } as any)
      .select("*")
      .single();

    if (inserted.error) return supaErr(res, inserted.error);



    return res.status(200).json({ ok: true, data: inserted.data });
  }

  // PATCH /api/aufmass-photos
  if (req.method === "PATCH") {
    const body = readJsonBody(req);
    const id = String(body?.id || "").trim();
    const caption = body?.caption == null ? null : String(body.caption);

    if (!id) return bad(res, "Missing id");

    const admin = getSupabaseAdminClient();
    const { data: photo, error: fetchErr } = await admin
      .from("aufmass_photos")
      .select("session_id")
      .eq("id", id)
      .single();

    if (fetchErr) return supaErr(res, fetchErr);
    if (!photo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Photo not found" } });

    try {
      await assertCanManagePhotos(photo.session_id);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    const { data, error } = await admin
      .from("aufmass_photos")
      .update({ caption })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return supaErr(res, error);

    return res.status(200).json({ ok: true, data });
  }

  // DELETE /api/aufmass-photos?id=...
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    if (!id) return bad(res, "Missing query: id");

    // 1. Get photo record — use admin client to bypass RLS
    const adminForFetch = getSupabaseAdminClient();
    const { data: photo, error: fetchErr } = await adminForFetch
      .from("aufmass_photos")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr) return supaErr(res, fetchErr);
    if (!photo) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Photo not found" } });

    // 2. Check if this is an admin photo
    const { data: uploaderProfile } = await adminForFetch
      .from("profiles")
      .select("role")
      .eq("id", photo.uploaded_by)
      .single();

    const isPhotoByAdmin = uploaderProfile?.role === "ADMIN";

    // 3. Check permissions
    try {
      await assertCanManagePhotos(photo.session_id);
      // Extra check: Non-admins cannot delete admin photos
      if (!isAdmin && isPhotoByAdmin) {
        throw { status: 403, code: "FORBIDDEN", message: "Photos added by administrators cannot be deleted by users or moderators." };
      }
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    // 3. Delete from Storage — use admin client to bypass storage RLS
    if (photo.storage_path) {
      const adminForStorage = getSupabaseAdminClient();
      const { error: storageErr } = await adminForStorage.storage
        .from(photo.storage_bucket || "aufmass-photos")
        .remove([photo.storage_path]);

      if (storageErr) {
        console.warn("Failed to remove file from storage", storageErr);
        // Continue to delete record anyway? Yes, to avoid phantom records.
      }
    }

    // 4. Delete from DB using ADMIN client to bypass RLS
    // The user has permission (checked above via assertCanManagePhotos), but RLS might be too strict.
    const admin = getSupabaseAdminClient();
    const { error: delErr } = await admin
      .from("aufmass_photos")
      .delete()
      .eq("id", id);

    if (delErr) return supaErr(res, delErr);

    return res.status(200).json({ ok: true, data: { deleted: true } });
  }

  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST, PATCH or DELETE" } });
}
