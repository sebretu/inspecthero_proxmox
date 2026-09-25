import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import formidable from "formidable";
import sharp from "sharp";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const config = {
  api: {
    bodyParser: false,
  },
};

const STORAGE_DIR = "/app/private_reports/lamp_types";
const GLOBAL_LIBRARY_FILE = path.join(STORAGE_DIR, "global_library.json");

function getFilePath(planId: string) {
  return path.join(STORAGE_DIR, `lamp_types_${planId}.json`);
}

function ensureDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export type LampTypeEntry = {
  model?: string;
  photoUrl?: string;
  photoBase64?: string;
  notes?: string;
  powerKw?: string;
  zuleitung?: string;
  updatedAt?: string;
};

export type LampVariant = {
  id: string;
  category: "notlicht_lampe" | "notlicht_pikto" | "notlicht_pikto_gross" | "lampe" | "warmepumpe_aussen" | "warmepumpe_innen" | "infrarotheizung" | "geraet_box";
  name: string;
  model: string;
  color: string;
  notes?: string;
  powerKw?: string;
  zuleitung?: string;
  photoUrl?: string;
  photoBase64?: string;
  updatedAt?: string;
};

export type PlanLampTypesConfig = {
  notlicht_lampe?: LampTypeEntry;
  notlicht_pikto?: LampTypeEntry;
  notlicht_pikto_gross?: LampTypeEntry;
  warmepumpe_aussen?: LampTypeEntry;
  warmepumpe_innen?: LampTypeEntry;
  infrarotheizung?: LampTypeEntry;
  geraet_box?: LampTypeEntry;
  variants?: LampVariant[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  ensureDir();
  const filePath = getFilePath(planId);

  // ── GET: Read configuration (with Global Library fallback) ──
  if (req.method === "GET") {
    try {
      let combined: PlanLampTypesConfig = {};
      if (fs.existsSync(GLOBAL_LIBRARY_FILE)) {
        try {
          combined = JSON.parse(fs.readFileSync(GLOBAL_LIBRARY_FILE, "utf8"));
        } catch {}
      }

      if (fs.existsSync(filePath)) {
        try {
          const customData: PlanLampTypesConfig = JSON.parse(fs.readFileSync(filePath, "utf8"));
          const symbolTypes = ["notlicht_lampe", "notlicht_pikto", "notlicht_pikto_gross", "warmepumpe_aussen", "warmepumpe_innen", "infrarotheizung", "geraet_box"] as const;
          for (const st of symbolTypes) {
            if (customData[st]) {
              combined[st] = { ...(combined[st] || {}), ...customData[st] };
            }
          }
          if (Array.isArray(customData.variants)) {
            const globalVars = combined.variants || [];
            const mergedVars = [...globalVars];
            for (const cv of customData.variants) {
              const idx = mergedVars.findIndex((gv) => gv.id === cv.id);
              if (idx !== -1) {
                mergedVars[idx] = { ...mergedVars[idx], ...cv };
              } else {
                mergedVars.push(cv);
              }
            }
            combined.variants = mergedVars;
          }
        } catch {}
      }

      return res.status(200).json({ lampTypes: combined });
    } catch (e: any) {
      console.error("[lamp-types GET] Error:", e);
      return res.status(500).json({ error: e.message || "Failed to read lamp types" });
    }
  }

  // ── POST / PUT: Save configuration & upload photos ──
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
      if (fs.existsSync(filePath)) {
        try {
          currentConfig = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch {}
      }

      // Check if raw JSON variants or data payload was passed
      const variantsPayload = Array.isArray(fields.variantsJson) ? fields.variantsJson[0] : fields.variantsJson;
      if (variantsPayload) {
        try {
          currentConfig.variants = JSON.parse(variantsPayload);
        } catch {}
      }

      const jsonPayload = Array.isArray(fields.data) ? fields.data[0] : fields.data;
      if (jsonPayload) {
        try {
          const parsed = JSON.parse(jsonPayload);
          currentConfig = { ...currentConfig, ...parsed };
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

          const photoFileName = `photo_${planId}_${st}_${Date.now()}.jpg`;
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

            const photoFileName = `photo_${planId}_var_${variant.id}_${Date.now()}.jpg`;
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

      // Always sync to Global Library so all plans share the exact same project library
      let globalConfig: PlanLampTypesConfig = {};
      if (fs.existsSync(GLOBAL_LIBRARY_FILE)) {
        try {
          globalConfig = JSON.parse(fs.readFileSync(GLOBAL_LIBRARY_FILE, "utf8"));
        } catch {}
      }

      for (const st of symbolTypes) {
        if (currentConfig[st]) {
          globalConfig[st] = { ...(globalConfig[st] || {}), ...currentConfig[st] };
        }
      }

      if (Array.isArray(currentConfig.variants)) {
        globalConfig.variants = currentConfig.variants;
      }

      fs.writeFileSync(GLOBAL_LIBRARY_FILE, JSON.stringify(globalConfig, null, 2), "utf8");

      // Automatically sync variant colors and models to existing symbols on this plan in DB
      if (currentConfig.variants && currentConfig.variants.length > 0) {
        try {
          const supabaseAdmin = getSupabaseAdminClient();
          const { data: symbols } = await supabaseAdmin
            .from("bma_symbols")
            .select("id, description")
            .eq("plan_id", planId);

          if (symbols) {
            for (const sym of symbols) {
              if (sym.description && sym.description.includes("variant")) {
                try {
                  const descObj = JSON.parse(sym.description);
                  const foundVar = currentConfig.variants.find(
                    (v) => v.id === descObj.variantId || v.name === descObj.variantName
                  );
                  if (foundVar) {
                    let changed = false;
                    if (descObj.variantColor !== foundVar.color) {
                      descObj.variantColor = foundVar.color;
                      changed = true;
                    }
                    if (descObj.variantModel !== foundVar.model) {
                      descObj.variantModel = foundVar.model;
                      changed = true;
                    }
                    if (descObj.variantName !== foundVar.name) {
                      descObj.variantName = foundVar.name;
                      changed = true;
                    }
                    if (changed) {
                      await supabaseAdmin
                        .from("bma_symbols")
                        .update({ description: JSON.stringify(descObj) })
                        .eq("id", sym.id);
                    }
                  }
                } catch {}
              }
            }
          }
        } catch (dbErr) {
          console.error("[lamp-types sync symbols error]", dbErr);
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(globalConfig, null, 2), "utf8");

      return res.status(200).json({ success: true, lampTypes: globalConfig });
    } catch (e: any) {
      console.error("[lamp-types POST] Error:", e);
      return res.status(500).json({ error: e.message || "Failed to save lamp types" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
