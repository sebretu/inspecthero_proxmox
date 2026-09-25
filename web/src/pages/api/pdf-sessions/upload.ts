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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let supabase: any;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
    if (!userId) throw new Error("Missing user");
  } catch (e: any) {
    console.error("Auth error in upload.ts:", e.message);
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 150 * 1024 * 1024, // 150MB
  });

  try {
    const { data: parseData, error: parseErr } = await new Promise<{ data: { fields: any; files: any } | null; error: any }>((resolve) => {
      form.parse(req, (err: any, fields: any, files: any) => {
        if (err) resolve({ data: null, error: err });
        else resolve({ data: { fields, files }, error: null });
      });
    });

    if (parseErr) throw parseErr;
    const { files } = parseData!;

    const f = (files as any).file as any | any[] | undefined;
    const file = Array.isArray(f) ? f[0] : f;

    if (!file) {
      return res.status(400).json({ ok: false, error: "Missing file" });
    }

    const tmpPath = file.filepath;
    const originalName = file.originalFilename || "document.pdf";
    const buf = await fs.readFile(tmpPath);

    const bucket = "pdf_sessions_files";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(16).slice(2, 10);
    const storagePath = `uploads/${userId}/${stamp}-${rand}-${safeName}`;

    const admin = getSupabaseAdminClient();
    const up = await admin.storage.from(bucket).upload(storagePath, buf, {
      contentType: "application/pdf",
      upsert: false,
    });

    if (up.error) {
      return res.status(400).json({ ok: false, error: up.error.message });
    }

    const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const publicUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;

    // Cleanup temp file
    await fs.unlink(tmpPath).catch(() => {});

    // Create record in DB
    const { data: session, error: dbErr } = await supabase
      .from("pdf_sessions")
      .insert({
        user_id: userId,
        name: originalName,
        pdf_url: publicUrl,
        symbols: [],
        texts: [],
        cutouts: [],
        zoom: 1.0,
        page_number: 1
      })
      .select()
      .single();

    if (dbErr) {
      console.error("DB Insert Error in upload.ts:", dbErr);
      return res.status(500).json({ ok: false, error: dbErr.message });
    }

    return res.status(200).json({ ok: true, data: session });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
