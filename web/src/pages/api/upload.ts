
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import os from "os";
import fs from "fs/promises";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const config = {
  api: {
    bodyParser: false,
  },
};

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  try {
    const { data: parseData, error: parseErr } = await new Promise<{ data: { fields: any; files: any } | null; error: any }>((resolve) => {
      form.parse(req, (err: any, fields: any, files: any) => {
        if (err) resolve({ data: null, error: err });
        else resolve({ data: { fields, files }, error: null });
      });
    });

    if (parseErr) throw parseErr;
    const { fields, files } = parseData!;

    const f = (files as any).file as any | any[] | undefined;
    const file = Array.isArray(f) ? f[0] : f;

    if (!file) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing file" } });
    }

    const tmpPath = file.filepath;
    const originalName = file.originalFilename || "upload.jpg";
    const buf = await fs.readFile(tmpPath);

    const bucket = "task-photos"; // Using existing bucket for now
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const storagePath = `uploads/${stamp}-${rand}-${safeName}`;

    const admin = getSupabaseAdminClient();
    const up = await admin.storage.from(bucket).upload(storagePath, buf, {
      contentType: file.mimetype || "image/jpeg",
      upsert: false,
    });

    if (up.error) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: up.error.message } });
    }

    const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const publicUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;

    // Cleanup temp file
    await fs.unlink(tmpPath).catch(() => {});

    return res.status(200).json({ ok: true, data: { url: publicUrl, storage_path: storagePath } });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
  }
}
