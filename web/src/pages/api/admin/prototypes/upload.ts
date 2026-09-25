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
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST" });
  }

  const supabase = getSupabaseAdminClient();
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  try {
    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err: any, fields: any, files: any) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const categoryRaw = Array.isArray(fields.category) ? fields.category[0] : fields.category;
    const category = (categoryRaw || "socket").toLowerCase().trim();
    const notesRaw = Array.isArray(fields.notes) ? fields.notes[0] : fields.notes;

    // Collect uploaded file items
    let fileList: any[] = [];
    if (files.files) {
      fileList = Array.isArray(files.files) ? files.files : [files.files];
    } else if (files.file) {
      fileList = Array.isArray(files.file) ? files.file : [files.file];
    }

    if (fileList.length === 0) {
      return res.status(400).json({ ok: false, error: "No files uploaded" });
    }

    const results = [];
    const warnings = [];

    for (const fileObj of fileList) {
      const originalFilename = fileObj.originalFilename || `prototype_${Date.now()}.png`;
      const tempPath = fileObj.filepath;

      try {
        const fileBuffer = await fs.readFile(tempPath);
        
        // 1. Validation & Readability Check with Sharp
        let metadata;
        try {
          metadata = await sharp(fileBuffer).metadata();
        } catch (sharpErr) {
          warnings.push(`File ${originalFilename} is unreadable or corrupted image format.`);
          continue;
        }

        const validFormats = ["png", "jpeg", "jpg", "webp", "svg"];
        if (!metadata.format || !validFormats.includes(metadata.format.toLowerCase())) {
          warnings.push(`File ${originalFilename} has unsupported format (${metadata.format}). Allowed: PNG, JPEG, WEBP, SVG.`);
          continue;
        }

        const width = metadata.width || 256;
        const height = metadata.height || 256;
        const dimensionsStr = `${width}x${height}`;
        const resolutionStr = `${metadata.density || 72} DPI`;
        const fileSize = fileBuffer.length;

        // Compute SHA-256 checksum
        const checksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

        // Check for duplicate checksum in prototype_symbols
        const { data: existingDup } = await supabase
          .from("prototype_symbols")
          .select("id, filename, category")
          .eq("checksum", checksum)
          .limit(1);

        if (existingDup && existingDup.length > 0) {
          warnings.push(`File ${originalFilename} is an exact duplicate of existing prototype #${existingDup[0].id} (${existingDup[0].filename} in category ${existingDup[0].category}).`);
        }

        // 2. Upload un-altered image to Supabase Storage
        const cleanName = originalFilename.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const storagePath = `${category}/${Date.now()}_${cleanName}`;

        const { error: storageErr } = await supabase.storage
          .from("prototype-library")
          .upload(storagePath, fileBuffer, {
            contentType: fileObj.mimetype || `image/${metadata.format}`,
            upsert: true,
          });

        if (storageErr) {
          throw new Error(`Storage upload failed: ${storageErr.message}`);
        }

        // 3. Generate 768D embedding vector automatically
        let embeddingVector: number[] = [];
        let embeddingStatus = "generated";

        try {
          embeddingVector = await generateImageEmbedding(fileBuffer);
        } catch (embErr: any) {
          console.error(`Failed to generate embedding for ${originalFilename}:`, embErr);
          embeddingStatus = "failed";
        }

        // 4. Save record into prototype_symbols
        const { data: inserted, error: insertErr } = await supabase
          .from("prototype_symbols")
          .insert({
            category,
            filename: originalFilename,
            storage_path: storagePath,
            embedding: embeddingVector.length > 0 ? embeddingVector : null,
            embedding_version: "v1",
            embedding_status: embeddingStatus,
            image_size: fileSize,
            dimensions: dimensionsStr,
            resolution: resolutionStr,
            version: 1,
            active: true,
            notes: notesRaw || null,
            checksum,
          })
          .select()
          .single();

        if (insertErr) {
          throw new Error(`Database insert failed: ${insertErr.message}`);
        }

        // Generate public URL
        const { data: publicUrlData } = supabase.storage
          .from("prototype-library")
          .getPublicUrl(storagePath);

        results.push({
          ...inserted,
          public_url: publicUrlData?.publicUrl || "",
        });

      } catch (fileErr: any) {
        console.error(`Error processing file ${originalFilename}:`, fileErr);
        warnings.push(`Error processing ${originalFilename}: ${fileErr.message}`);
      } finally {
        // Clean up temp file
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
    }

    return res.status(200).json({
      ok: true,
      uploaded: results,
      count: results.length,
      warnings,
    });

  } catch (err: any) {
    console.error("[api/admin/prototypes/upload] Form parse error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
