// src/pages/api/plans/upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import formidable, { type File as FormidableFile } from "formidable";
import crypto from "crypto";
import os from "os";
import path from "path";
import fsSync from "fs";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

export const config = {
  api: {
    bodyParser: false, // IMPORTANT for multipart/form-data
  },
};

const execFileAsync = promisify(execFile);

function json(res: NextApiResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function parseMultipart(req: NextApiRequest): Promise<{
  fields: Record<string, any>;
  file: FormidableFile;
}> {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 200 * 1024 * 1024, // 200MB
    filter: (part) => {
      // accept only pdf in file field
      if (part.name !== "file") return true;
      const ct = (part.mimetype || "").toLowerCase();
      return ct.includes("pdf") || (part.originalFilename || "").toLowerCase().endsWith(".pdf");
    },
  });

  return await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      const f = (files as any).file as FormidableFile | FormidableFile[] | undefined;
      const file = Array.isArray(f) ? f[0] : f;

      if (!file) return reject(new Error("Missing file (field name: file)"));
      resolve({ fields: fields as any, file });
    });
  });
}

/**
 * Usuwa alpha i spłaszcza PNG na białe tło (ImageMagick).
 * Jeśli ImageMagick nie jest dostępny, nie wywala procesu – tylko log.
 */
async function flattenPngToWhite(inputPng: string, outputPng: string) {
  try {
    // convert in.png -background white -alpha remove -alpha off out.png
    await execFileAsync("convert", [inputPng, "-background", "white", "-alpha", "remove", "-alpha", "off", outputPng]);
  } catch (e: any) {
    console.error("[plans/upload] flattenPngToWhite failed (convert):", e?.message || e);
    // fallback: przepisz plik 1:1, żeby pipeline i tak działał
    if (inputPng !== outputPng) {
      await fs.copyFile(inputPng, outputPng);
    }
  }
}

/**
 * Po generowaniu tiles: usuń alpha ze wszystkich kafli.
 * To naprawia “siwy” plan + kratkę między kaflami.
 */
async function flattenTilesDirToWhite(dir: string) {
  try {
    // find dir -type f -name "*.png" ! -name "blank.png" -print0 | xargs -0 mogrify ...
    // robimy to w Node bez find/xargs, żeby było przenośne
    const walk = async (p: string) => {
      const entries = await fs.readdir(p, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(p, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.isFile()) {
          if (!ent.name.toLowerCase().endsWith(".png")) continue;
          if (ent.name === "blank.png") continue;

          // mogrify modyfikuje plik in-place
          try {
            await execFileAsync("mogrify", ["-background", "white", "-alpha", "remove", "-alpha", "off", full]);
          } catch (e: any) {
            // jak nie ma mogrify, próbuj convert → tmp → replace
            try {
              const tmp = full + ".tmp.png";
              await execFileAsync("convert", [full, "-background", "white", "-alpha", "remove", "-alpha", "off", tmp]);
              await fs.rename(tmp, full);
            } catch (e2: any) {
              console.error("[plans/upload] flatten tile failed:", full, e2?.message || e2);
            }
          }
        }
      }
    };
    await walk(dir);
  } catch (e: any) {
    console.error("[plans/upload] flattenTilesDirToWhite failed:", e?.message || e);
  }
}

async function generateTilesInBackground(opts: {
  planId: string;
  pdfPathOnDisk: string; // local tmp file path
  dpi: number;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}) {
  const supabase = getSupabaseAdmin();

  // osobny try/catch żeby nie wywalić handlera
  (async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tiles-"));
    const pngBase = path.join(workDir, "page");

    try {
      // 1) PDF -> PNG (pierwsza strona)
      await execFileAsync("pdftoppm", ["-png", "-r", String(opts.dpi), opts.pdfPathOnDisk, pngBase]);

      const page1 = `${pngBase}-1.png`;
      const planPng = path.join(workDir, "plan.png");

      // 1b) WAŻNE: spłaszcz do białego (usuń alpha) zanim zrobimy tiles
      await flattenPngToWhite(page1, planPng);

      // 2) Generuj tiles
      const webRoot = process.cwd();
      await execFileAsync("node", [
        path.join(webRoot, "scripts", "generate-tiles.mjs"),
        `--planId=${opts.planId}`,
        `--input=${planPng}`,
        `--tileSize=${opts.tileSize}`,
        `--minZoom=${opts.minZoom}`,
        `--maxZoom=${opts.maxZoom}`,
      ]);

      // 2b) WAŻNE: usuń alpha z wygenerowanych kafli (naprawa “siwe” + kratka)
      const tilesDir = path.join(webRoot, "public", "tiles", opts.planId);
      if (fsSync.existsSync(tilesDir)) {
        await flattenTilesDirToWhite(tilesDir);
      }

      // 3) Sukces -> czyść processing_error
      await supabase.from("plans").update({ processing_error: null }).eq("id", opts.planId);

      // cleanup
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error("[plans/upload] tiles generation failed:", msg);

      await supabase
        .from("plans")
        .update({ processing_error: `tiles generation failed: ${msg}` })
        .eq("id", opts.planId);

      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  })().catch((e) => {
    console.error("[plans/upload] background job crashed:", e?.message || e);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const { fields, file } = await parseMultipart(req);

    const projectId = String(fields.projectId || "");
    const floorId = String(fields.floorId || "");
    const versionRaw = String(fields.version || "");
    const version = Number.parseInt(versionRaw, 10);

    if (!projectId) {
      json(res, 400, { ok: false, error: "Missing field: projectId" });
      return;
    }
    if (!floorId) {
      json(res, 400, { ok: false, error: "Missing field: floorId" });
      return;
    }
    if (!Number.isFinite(version) || version <= 0) {
      json(res, 400, { ok: false, error: "Invalid field: version (must be positive integer)" });
      return;
    }

    const tmpPath = (file as any).filepath as string | undefined;
    const originalName = (file as any).originalFilename as string | undefined;

    if (!tmpPath) {
      json(res, 400, { ok: false, error: "Upload failed: missing temp file path" });
      return;
    }

    // 1) Upload PDF to Supabase Storage
    const supabase = getSupabaseAdmin();

    const storageBucket = "plans";
    const storagePath = `projects/${projectId}/floors/${floorId}/v${version}.pdf`;

    const pdfBytes = await fs.readFile(tmpPath);

    const up = await supabase.storage.from(storageBucket).upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (up.error) {
      json(res, 500, { ok: false, error: `storage upload failed: ${up.error.message}` });
      return;
    }

    // 2) Insert plan row
    const pdf_path = path.basename(storagePath);

    const ins = await supabase
      .from("plans")
      .insert({
        project_id: projectId,
        floor_id: floorId,
        version,
        status: "READY",
        pdf_path,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        is_current: true,
        image_path: null,
        image_width: null,
        image_height: null,
        processing_error: null,
      })
      .select("id")
      .single();

    if (ins.error) {
      json(res, 500, { ok: false, error: `db insert failed: ${ins.error.message}` });
      return;
    }

    const planId = ins.data.id as string;

    // 3) Mark other versions as not current (best-effort)
    await supabase
      .from("plans")
      .update({ is_current: false })
      .eq("project_id", projectId)
      .eq("floor_id", floorId)
      .neq("id", planId);

    // 4) Start tiles generation in background (does NOT block response)
    generateTilesInBackground({
      planId,
      pdfPathOnDisk: tmpPath,
      dpi: 150,
      tileSize: 256,
      minZoom: 1,
      maxZoom: 5,
    });

    // 5) OK (fast response)
    json(res, 200, {
      ok: true,
      data: {
        id: planId,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        original_name: originalName ?? null,
        tiles: "PROCESSING",
      },
    });
    return;
  } catch (e: any) {
    console.error("[plans/upload] error:", e?.message || e);
    json(res, 500, { ok: false, error: e?.message ?? "Server error" });
    return;
  }
}
