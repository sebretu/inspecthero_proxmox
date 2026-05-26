import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

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
    error: { code: "SUPABASE", message: error?.message || "supabase error", meta: { code: error?.code } },
  });
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

  // POST /api/charger-photos
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const charger_id = String(body?.charger_id || "").trim();
    const file_name = String(body?.file_name || "").trim() || "photo.jpg";
    const base64 = String(body?.base64 || "").trim();

    if (!charger_id) return bad(res, "Missing charger_id");
    if (!base64) return bad(res, "Missing base64");

    const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return bad(res, "Invalid base64");
    }

    const bucket = "charger_photos";
    const safeName = file_name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const storage_path = `${charger_id}/${stamp}-${rand}-${safeName}`;

    const ext = safeName.toLowerCase().split(".").pop() || "";
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : ext === "heic" || ext === "heif"
              ? "image/heic"
              : "image/jpeg";

    let PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const publicUrl = PUBLIC_SUPABASE_URL ? `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storage_path}` : null;
    if (!publicUrl) return bad(res, "Failed to create public URL");

    const adminClient = getSupabaseAdminClient();
    const uploadResult = await adminClient.storage.from(bucket).upload(storage_path, buf, {
      upsert: false,
      contentType,
      cacheControl: "3600",
    });

    if (uploadResult.error) return supaErr(res, uploadResult.error);

    // Update charger with photo_url
    const { error: updateErr } = await adminClient.from("chargers").update({ photo_url: publicUrl }).eq("id", charger_id);
    if (updateErr) return supaErr(res, updateErr);

    return res.status(200).json({ ok: true, data: { publicUrl, storage_path } });
  }

  res.setHeader("Allow", "POST");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
}
