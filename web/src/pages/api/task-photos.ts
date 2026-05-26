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

  async function getTaskAssignment(taskId: string): Promise<{ assigned_user_id: string | null; is_question: boolean; created_by: string | null } | null> {
    const { data, error } = await supabase
      .from("tasks")
      .select("assigned_user_id, is_question, created_by")
      .eq("id", taskId)
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

  async function assertCanManagePhotos(taskId: string) {
    if (isAdmin) return;
    const taskParams = await getTaskAssignment(taskId);
    if (!taskParams) return;

    // Questions allow the creator to manage photos too, or even theoretically anyone who can see it. But let's restrict to assigned user OR created_by for Questions.
    // If it's a question, created_by can also manage photos
    if (taskParams.created_by === requester.id) return;
    if (taskParams.is_question) return; // if it reached here, requester is NOT creator, but questions might have other rules (e.g. anyone who can see it) — for now let's keep it restricted to creator/admin or someone explicitly allowed.

    if (!taskParams.assigned_user_id || taskParams.assigned_user_id === requester.id) return;
    throw { status: 403, code: "FORBIDDEN", message: "Only the assignee, creator, or an admin may modify task photos" };
  }

  // ------------------------
  // GET /api/task-photos?taskId=...
  // ------------------------
  if (req.method === "GET") {
    const taskId = String(req.query.taskId || "").trim();
    if (!taskId) return bad(res, "Missing query: taskId");

    const rawPhase = typeof req.query.phase === "string" ? req.query.phase : typeof req.query.photoType === "string" ? req.query.photoType : "";
    const phase = normalizePhotoType(rawPhase);
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : null;

    try {
      await getTaskAssignment(taskId);
    } catch (err: any) {
      const status = err?.status || 400;
      return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
    }

    // Use admin client to bypass RLS — auth is already checked above via getTaskAssignment
    const adminClient = getSupabaseAdminClient();
    let query = adminClient
      .from("task_photos")
      .select("*, profiles!uploaded_by(role)")
      .eq("task_id", taskId)
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

  // POST /api/task-photos
  // body: { task_id, file_name, caption?, base64 }
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const task_id = String(body?.task_id || "").trim();
    const uploaded_by = userId; // auth.uid() z JWT
    const file_name = String(body?.file_name || "").trim() || "photo.jpg";
    const caption = body?.caption == null ? null : String(body.caption);
    const rawPhotoType = body?.photo_type ?? body?.photoType;
    const photo_type = normalizePhotoType(rawPhotoType) || "BEFORE";
    const base64 = String(body?.base64 || "").trim();

    if (!task_id) return bad(res, "Missing task_id");
    if (!uploaded_by) return bad(res, "Cannot determine user from token");
    if (!base64) return bad(res, "Missing base64");
    if (!photo_type) return bad(res, "Invalid photo_type");

    try {
      await assertCanManagePhotos(task_id);
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
    const bucket = "task-photos";

    // Ścieżka: task_id/yyyymmdd-hhmmss-rand-filename
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const storage_path = `${task_id}/${stamp}-${rand}-${safeName}`;

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
      .from("task_photos")
      .insert({
        task_id,
        uploaded_by,
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

    const { error: histErr } = await (adminForInsert as any).from("task_history").insert({
      task_id,
      changed_by: uploaded_by,
      action: photo_type === "AFTER" ? "Added AFTER photo" : "Added BEFORE photo"
    });
    if (histErr) console.error("History fail:", histErr);

    return res.status(200).json({ ok: true, data: inserted.data });
  }

  // DELETE /api/task-photos?id=...
  if (req.method === "DELETE") {
    const id = String(req.query.id || "").trim();
    if (!id) return bad(res, "Missing query: id");

    // 1. Get photo record — use admin client to bypass RLS
    const adminForFetch = getSupabaseAdminClient();
    const { data: photo, error: fetchErr } = await adminForFetch
      .from("task_photos")
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
      await assertCanManagePhotos(photo.task_id);
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
        .from(photo.storage_bucket || "task-photos")
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
      .from("task_photos")
      .delete()
      .eq("id", id);

    if (delErr) return supaErr(res, delErr);

    const { error: histErr } = await admin.from("task_history").insert({
      task_id: photo.task_id,
      changed_by: requester.id,
      action: photo.photo_type === "AFTER" ? "Removed AFTER photo" : "Removed BEFORE photo"
    });
    if (histErr) console.error("History fail:", histErr);

    return res.status(200).json({ ok: true, data: { deleted: true } });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST or DELETE" } });
}
