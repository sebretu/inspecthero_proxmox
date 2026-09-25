import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import formidable from "formidable";
import sharp from "sharp";
import { PlanLampTypesConfig } from "../plans/[id]/lamp-types";

export const config = {
  api: {
    bodyParser: false,
  },
};

const STORAGE_DIR = "/app/private_reports/lamp_types";
const GLOBAL_LIBRARY_FILE = path.join(STORAGE_DIR, "global_library.json");

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  ensureDir();

  // ── GET: Return the global lamp library ──
  if (req.method === "GET") {
    try {
      if (fs.existsSync(GLOBAL_LIBRARY_FILE)) {
        const raw = fs.readFileSync(GLOBAL_LIBRARY_FILE, "utf8");
        const data = JSON.parse(raw);
        return res.status(200).json({ library: data });
      }
      return res.status(200).json({ library: null });
    } catch (e: any) {
      console.error("[lamp-types library GET] Error:", e);
      return res.status(500).json({ error: e.message || "Failed to read global library" });
    }
  }

  // ── POST / PUT: Save or update the global lamp library ──
  if (req.method === "POST" || req.method === "PUT") {
    try {
      const form = formidable({
        multiples: true,
        keepExtensions: true,
        maxFileSize: 20 * 1024 * 1024, // 20MB
      });

      const [fields, files] = await new Promise<[any, any]>((resolve, reject) => {
        form.parse(req, (err: any, fields: any, files: any) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      });

      let currentConfig: PlanLampTypesConfig = {};
      if (fs.existsSync(GLOBAL_LIBRARY_FILE)) {
        try {
          currentConfig = JSON.parse(fs.readFileSync(GLOBAL_LIBRARY_FILE, "utf8"));
        } catch {}
      }

      // Check if full JSON config was sent directly
      const dataPayload = Array.isArray(fields.data) ? fields.data[0] : fields.data;
      if (dataPayload) {
        try {
          const parsed = JSON.parse(dataPayload);
          currentConfig = { ...currentConfig, ...parsed };
        } catch {}
      }

      // Check if variants JSON was sent
      const variantsPayload = Array.isArray(fields.variantsJson) ? fields.variantsJson[0] : fields.variantsJson;
      if (variantsPayload) {
        try {
          currentConfig.variants = JSON.parse(variantsPayload);
        } catch {}
      }

      // Process default category text fields
      const symbolTypes = ["notlicht_lampe", "notlicht_pikto", "notlicht_pikto_gross", "warmepumpe_aussen", "warmepumpe_innen", "infrarotheizung", "geraet_box"] as const;
      for (const st of symbolTypes) {
        const modelKey = `model_${st}`;
        const notesKey = `notes_${st}`;
        const removePhotoKey = `removePhoto_${st}`;

        if (fields[modelKey] !== undefined) {
          const val = Array.isArray(fields[modelKey]) ? fields[modelKey][0] : fields[modelKey];
          if (!currentConfig[st]) currentConfig[st] = {};
          currentConfig[st]!.model = val || "";
        }
        if (fields[notesKey] !== undefined) {
          const val = Array.isArray(fields[notesKey]) ? fields[notesKey][0] : fields[notesKey];
          if (!currentConfig[st]) currentConfig[st] = {};
          currentConfig[st]!.notes = val || "";
        }
        if (fields[removePhotoKey] === "true" || fields[removePhotoKey] === "1") {
          if (currentConfig[st]) {
            currentConfig[st]!.photoUrl = undefined;
            currentConfig[st]!.photoBase64 = undefined;
          }
        }
      }

      // Process uploaded photo files for default categories
      for (const st of symbolTypes) {
        const fileKey = `photo_${st}`;
        const uploadedFile = files[fileKey];
        const singleFile = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

        if (singleFile && singleFile.filepath) {
          const fileBuf = fs.readFileSync(singleFile.filepath);
          const optimizedBuf = await sharp(fileBuf)
            .resize(800, 600, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

          const photoFileName = `photo_global_${st}_${Date.now()}.jpg`;
          const photoDiskPath = path.join(STORAGE_DIR, photoFileName);
          fs.writeFileSync(photoDiskPath, optimizedBuf);

          const photoBase64 = `data:image/jpeg;base64,${optimizedBuf.toString("base64")}`;
          const photoUrl = `/api/reports/lamp_photo?filename=${photoFileName}`;

          if (!currentConfig[st]) currentConfig[st] = {};
          currentConfig[st]!.photoUrl = photoUrl;
          currentConfig[st]!.photoBase64 = photoBase64;
          currentConfig[st]!.updatedAt = new Date().toISOString();
        }
      }

      // Process uploaded photo files for individual variants
      if (currentConfig.variants && Array.isArray(currentConfig.variants)) {
        for (const variant of currentConfig.variants) {
          const fileKey = `photo_variant_${variant.id}`;
          const uploadedFile = files[fileKey];
          const singleFile = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

          if (singleFile && singleFile.filepath) {
            const fileBuf = fs.readFileSync(singleFile.filepath);
            const optimizedBuf = await sharp(fileBuf)
              .resize(800, 600, { fit: "inside", withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();

            const photoFileName = `photo_global_var_${variant.id}_${Date.now()}.jpg`;
            const photoDiskPath = path.join(STORAGE_DIR, photoFileName);
            fs.writeFileSync(photoDiskPath, optimizedBuf);

            variant.photoBase64 = `data:image/jpeg;base64,${optimizedBuf.toString("base64")}`;
            variant.photoUrl = `/api/reports/lamp_photo?filename=${photoFileName}`;
            variant.updatedAt = new Date().toISOString();
          }

          const removePhotoKey = `removePhoto_variant_${variant.id}`;
          if (fields[removePhotoKey] === "true" || fields[removePhotoKey] === "1") {
            variant.photoUrl = undefined;
            variant.photoBase64 = undefined;
          }
        }
      }

      fs.writeFileSync(GLOBAL_LIBRARY_FILE, JSON.stringify(currentConfig, null, 2), "utf8");

      return res.status(200).json({ success: true, library: currentConfig });
    } catch (e: any) {
      console.error("[lamp-types library POST] Error:", e);
      return res.status(500).json({ error: e.message || "Failed to save global library" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
