import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "30mb",
    },
  },
};

type ApiOk = { ok: true; data: { url: string; storage_path: string; width?: number; height?: number } };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Only POST allowed" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing or invalid token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Unable to load profile" } });
  }

  if (!isAdminRole(requester.role)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Nur Administratoren haben Zugriff auf Dokumentation." } });
  }

  const { base64, fileName, type = "main" } = req.body || {};
  if (!base64 || typeof base64 !== "string") {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing base64 image data" } });
  }

  const b64 = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid base64 encoding" } });
  }

  const bucket = "documentation-photos";
  const cleanName = (fileName || "photo.jpg").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `${type}/${stamp}-${rand}-${cleanName}`;

  const ext = cleanName.toLowerCase().split(".").pop() || "jpg";
  const contentType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";

  const adminClient = getSupabaseAdminClient();
  const uploadRes = await adminClient.storage.from(bucket).upload(storagePath, buf, {
    upsert: false,
    contentType,
    cacheControl: "3600",
  });

  if (uploadRes.error) {
    return res.status(500).json({ ok: false, error: { code: "STORAGE_ERROR", message: uploadRes.error.message } });
  }

  const publicUrlBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publicUrl = `${publicUrlBase}/storage/v1/object/public/${bucket}/${storagePath}`;

  return res.status(200).json({
    ok: true,
    data: {
      url: publicUrl,
      storage_path: storagePath,
    },
  });
}
