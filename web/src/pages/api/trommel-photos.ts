import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  try {
    await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  // POST /api/trommel-photos — upload a photo, return public URL
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const trommel_id = String(body?.trommel_id || "").trim();
    const file_name  = String(body?.file_name || "photo.jpg").trim();
    const base64     = String(body?.base64 || "").trim();

    if (!base64) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing base64" } });
    }

    const admin = getSupabaseAdminClient();
    const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid base64" } });
    }

    const safeName = file_name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const folder = trommel_id || "global";
    const storage_path = `${folder}/${stamp}-${rand}-${safeName}`;

    const ext = safeName.toLowerCase().split(".").pop() || "";
    const contentType =
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "gif" ? "image/gif" :
      (ext === "heic" || ext === "heif") ? "image/heic" :
      "image/jpeg";

    const bucket = "trommel-photos";
    const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const publicUrl = PUBLIC_SUPABASE_URL
      ? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storage_path}`
      : null;

    if (!publicUrl) {
      return res.status(500).json({ ok: false, error: { code: "CONFIG_ERROR", message: "NEXT_PUBLIC_SUPABASE_URL not set" } });
    }

    const uploadResult = await admin.storage.from(bucket).upload(storage_path, buf, {
      upsert: false,
      contentType,
      cacheControl: "3600",
    });

    if (uploadResult.error) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: uploadResult.error.message } });
    }

    return res.status(200).json({ ok: true, data: { url: publicUrl, storage_path } });
  }

  // DELETE /api/trommel-photos?path=... — remove from storage
  if (req.method === "DELETE") {
    const admin = getSupabaseAdminClient();
    const storagePath = String(req.query.path || "").trim();
    if (!storagePath) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing path" } });
    }

    await admin.storage.from("trommel-photos").remove([storagePath]);
    return res.status(200).json({ ok: true, data: { deleted: true } });
  }

  res.setHeader("Allow", "POST, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST or DELETE" } });
}
