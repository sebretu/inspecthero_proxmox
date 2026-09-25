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
  let client: any;
  let userId: string | null = null;
  try {
    ({ client, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  if (!userId) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Unauthorized" } });
  }

  // Fetch requester profile to check permissions
  const { data: profile, error: profileErr } = await client
    .from("profiles")
    .select("id, role, has_vde_access, full_name")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "User profile not found" } });
  }

  const role = (profile.role || "").toUpperCase();
  const hasVdeAccess = !!profile.has_vde_access;
  const isAdmin = role === "ADMIN";
  const isAuthorized = isAdmin || hasVdeAccess;

  if (!isAuthorized) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Access denied" } });
  }

  const admin = getSupabaseAdminClient();

  if (req.method === "GET") {
    let query = client.from("vde_protocols").select("*").order("created_at", { ascending: false });

    if (!isAdmin) {
      query = query.eq("created_by", profile.id);
    }

    const { data: protocols, error: queryErr } = await query;

    if (queryErr) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: queryErr.message } });
    }

    return res.status(200).json({ ok: true, data: protocols ?? [] });
  }

  if (req.method === "POST") {
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
        return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing PDF file" } });
      }

      const tmpPath = file.filepath;
      const originalName = file.originalFilename || "protocol.pdf";
      const buf = await fs.readFile(tmpPath);

      const bucket = "vde-protocols";
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rand = Math.random().toString(16).slice(2, 10);
      const storagePath = `uploads/${stamp}-${rand}-${safeName}`;

      const up = await admin.storage.from(bucket).upload(storagePath, buf, {
        contentType: file.mimetype || "application/pdf",
        upsert: false,
      });

      if (up.error) {
        // cleanup
        await fs.unlink(tmpPath).catch(() => {});
        return res.status(400).json({ ok: false, error: { code: "SUPABASE_STORAGE", message: up.error.message } });
      }

      const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
      const publicUrl = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;

      // cleanup temp file
      await fs.unlink(tmpPath).catch(() => {});

      // Parse extra fields
      const anlage = Array.isArray(fields.anlage) ? fields.anlage[0] : fields.anlage || "";
      const prueferName = Array.isArray(fields.pruefer_name) ? fields.pruefer_name[0] : fields.pruefer_name || "";
      const stateStr = Array.isArray(fields.state) ? fields.state[0] : fields.state;

      // If state JSON is provided, save it as a .json file next to the PDF
      if (stateStr) {
        const statePath = `${storagePath}.json`;
        await admin.storage.from(bucket).upload(statePath, stateStr, {
          contentType: "application/json",
          upsert: false,
        });
      }

      // Insert record
      const { data: inserted, error: insertErr } = await client
        .from("vde_protocols")
        .insert({
          name: originalName,
          file_url: publicUrl,
          storage_path: storagePath,
          created_by: profile.id,
          created_by_name: profile.full_name,
          anlage,
          pruefer_name: prueferName
        })
        .select()
        .single();

      if (insertErr) {
        // Rollback uploaded file from storage
        await admin.storage.from(bucket).remove([storagePath]).catch(() => {});
        return res.status(400).json({ ok: false, error: { code: "SUPABASE_DB", message: insertErr.message } });
      }

      return res.status(200).json({ ok: true, data: inserted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
  }

  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only administrators can delete protocols" } });
    }

    // Since we disable bodyParser, let's parse query parameters for deletion ID
    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing id query parameter" } });
    }

    // Fetch the protocol to get storage path
    const { data: protocol, error: fetchErr } = await client
      .from("vde_protocols")
      .select("id, storage_path")
      .eq("id", id)
      .single();

    if (fetchErr || !protocol) {
      return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Protocol not found" } });
    }

    // Delete from storage
    const bucket = "vde-protocols";
    const { error: storageDelErr } = await admin.storage.from(bucket).remove([protocol.storage_path]);

    // Note: even if storage file was already deleted or fails, we proceed to delete from DB to avoid orphaned entries.
    if (storageDelErr) {
      console.warn("Storage deletion warning/error:", storageDelErr.message);
    }

    // Delete from DB
    const { error: dbDelErr } = await client
      .from("vde_protocols")
      .delete()
      .eq("id", id);

    if (dbDelErr) {
      return res.status(400).json({ ok: false, error: { code: "SUPABASE_DB", message: dbDelErr.message } });
    }

    return res.status(200).json({ ok: true, data: { id } });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
}
