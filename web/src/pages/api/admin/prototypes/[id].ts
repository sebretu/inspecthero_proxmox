import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateImageEmbedding } from "@/lib/embeddingService";

export const config = {
  api: {
    bodyParser: false, // Disables body parser to handle both JSON and multipart form data
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ ok: false, error: "Invalid prototype ID" });
  }

  const supabase = getSupabaseAdminClient();

  // Handle DELETE request
  if (req.method === "DELETE") {
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from("prototype_symbols")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !existing) {
        return res.status(404).json({ ok: false, error: "Prototype not found" });
      }

      // Delete storage file
      if (existing.storage_path) {
        await supabase.storage.from("prototype-library").remove([existing.storage_path]);
      }

      // Delete DB record
      const { error: delErr } = await supabase.from("prototype_symbols").delete().eq("id", id);
      if (delErr) throw delErr;

      return res.status(200).json({ ok: true, message: "Prototype deleted successfully" });
    } catch (err: any) {
      console.error("[api/admin/prototypes/[id]] Delete error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Handle GET request
  if (req.method === "GET") {
    try {
      const { data: proto, error: fetchErr } = await supabase
        .from("prototype_symbols")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !proto) {
        return res.status(404).json({ ok: false, error: "Prototype not found" });
      }

      // Fetch version history lineage
      const { data: versions } = await supabase
        .from("prototype_symbols")
        .select("id, filename, version, active, created_at, embedding_status, notes")
        .or(`id.eq.${id},parent_id.eq.${id},id.eq.${proto.parent_id || id}`)
        .order("version", { ascending: false });

      const { data: urlData } = supabase.storage
        .from("prototype-library")
        .getPublicUrl(proto.storage_path);

      return res.status(200).json({
        ok: true,
        prototype: {
          ...proto,
          public_url: urlData?.publicUrl || "",
        },
        version_history: versions || [],
      });
    } catch (err: any) {
      console.error("[api/admin/prototypes/[id]] GET error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // Handle PUT request (Update / Replace / Regenerate / Duplicate / Rollback)
  if (req.method === "PUT") {
    const contentType = req.headers["content-type"] || "";

    try {
      let fields: any = {};
      let files: any = {};

      if (contentType.includes("multipart/form-data")) {
        const form = formidable({
          multiples: false,
          keepExtensions: true,
          uploadDir: os.tmpdir(),
        });
        const parseRes = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
          form.parse(req, (err: any, fields: any, files: any) => {
            if (err) reject(err);
            else resolve({ fields, files });
          });
        });
        fields = parseRes.fields;
        files = parseRes.files;
      } else {
        // Parse JSON body
        const rawBody = await new Promise<string>((resolve) => {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => resolve(body));
        });
        fields = JSON.parse(rawBody || "{}");
      }

      const action = Array.isArray(fields.action) ? fields.action[0] : fields.action;

      // 1. Fetch current record
      const { data: current, error: curErr } = await supabase
        .from("prototype_symbols")
        .select("*")
        .eq("id", id)
        .single();

      if (curErr || !current) {
        return res.status(404).json({ ok: false, error: "Prototype not found" });
      }

      // Action: REGENERATE EMBEDDING
      if (action === "regenerate_embedding") {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("prototype-library")
          .download(current.storage_path);

        if (dlErr || !fileData) {
          throw new Error("Failed to download prototype image from storage");
        }

        const buf = Buffer.from(await fileData.arrayBuffer());
        const vector = await generateImageEmbedding(buf);

        const { data: updated, error: upErr } = await supabase
          .from("prototype_symbols")
          .update({
            embedding: vector,
            embedding_status: "generated",
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (upErr) throw upErr;
        return res.status(200).json({ ok: true, prototype: updated });
      }

      // Action: DUPLICATE
      if (action === "duplicate") {
        const targetCategory = (Array.isArray(fields.category) ? fields.category[0] : fields.category) || current.category;
        const newFilename = `copy_of_${current.filename}`;

        const { data: dup, error: dupErr } = await supabase
          .from("prototype_symbols")
          .insert({
            category: targetCategory,
            filename: newFilename,
            storage_path: current.storage_path,
            embedding: current.embedding,
            embedding_version: current.embedding_version,
            embedding_status: current.embedding_status,
            image_size: current.image_size,
            dimensions: current.dimensions,
            resolution: current.resolution,
            version: 1,
            active: true,
            notes: `Duplicated from #${current.id}`,
            checksum: current.checksum,
          })
          .select()
          .single();

        if (dupErr) throw dupErr;
        return res.status(200).json({ ok: true, prototype: dup, message: "Prototype duplicated successfully" });
      }

      // Action: REPLACE IMAGE (Creates Version N+1)
      if (files.file) {
        const fileObj = Array.isArray(files.file) ? files.file[0] : files.file;
        const tempPath = fileObj.filepath;
        const fileBuffer = await fs.readFile(tempPath);

        const metadata = await sharp(fileBuffer).metadata();
        const dimensionsStr = `${metadata.width || 256}x${metadata.height || 256}`;
        const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        const cleanName = (fileObj.originalFilename || current.filename).replace(/[^a-zA-Z0-9_.-]/g, "_");
        const newVersion = (current.version || 1) + 1;
        const storagePath = `${current.category}/v${newVersion}_${cleanName}`;

        await supabase.storage.from("prototype-library").upload(storagePath, fileBuffer, {
          contentType: fileObj.mimetype || `image/${metadata.format}`,
          upsert: true,
        });

        const embeddingVector = await generateImageEmbedding(fileBuffer);

        // Deactivate old version
        await supabase.from("prototype_symbols").update({ active: false }).eq("id", id);

        // Insert new version
        const { data: newVersionRecord, error: newVerErr } = await supabase
          .from("prototype_symbols")
          .insert({
            category: current.category,
            filename: fileObj.originalFilename || current.filename,
            storage_path: storagePath,
            embedding: embeddingVector,
            embedding_version: "v1",
            embedding_status: "generated",
            image_size: fileBuffer.length,
            dimensions: dimensionsStr,
            resolution: `${metadata.density || 72} DPI`,
            version: newVersion,
            parent_id: current.id,
            active: true,
            notes: (Array.isArray(fields.notes) ? fields.notes[0] : fields.notes) || `Replaced version ${current.version}`,
            checksum,
          })
          .select()
          .single();

        if (newVerErr) throw newVerErr;

        try { await fs.unlink(tempPath); } catch {}

        return res.status(200).json({ ok: true, prototype: newVersionRecord, message: `Created Version ${newVersion}` });
      }

      // Metadata Update (Category, Notes, Active Status)
      const updateData: any = { updated_at: new Date().toISOString() };
      if (fields.category !== undefined) updateData.category = Array.isArray(fields.category) ? fields.category[0] : fields.category;
      if (fields.notes !== undefined) updateData.notes = Array.isArray(fields.notes) ? fields.notes[0] : fields.notes;
      if (fields.active !== undefined) updateData.active = (fields.active === true || fields.active === "true");

      const { data: updated, error: upErr } = await supabase
        .from("prototype_symbols")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (upErr) throw upErr;

      return res.status(200).json({ ok: true, prototype: updated });

    } catch (err: any) {
      console.error("[api/admin/prototypes/[id]] PUT error:", err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
