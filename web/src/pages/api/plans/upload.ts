// src/pages/api/plans/upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import crypto from "crypto";
import os from "os";
import path from "path";
import fsSync from "fs";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateTilesInBackground } from "@/lib/tileGenerator";

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


async function parseMultipart(req: NextApiRequest): Promise<{
  fields: Record<string, any>;
  file: any;
}> {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 200 * 1024 * 1024, // 200MB
    filter: (part: any) => {
      // accept only pdf in file field
      if (part.name !== "file") return true;
      const ct = (part.mimetype || "").toLowerCase();
      return ct.includes("pdf") || (part.originalFilename || "").toLowerCase().endsWith(".pdf");
    },
  });

  return await new Promise((resolve, reject) => {
    form.parse(req, (err: any, fields: any, files: any) => {
      if (err) return reject(err);

      const f = (files as any).file as any | any[] | undefined;
      const file = Array.isArray(f) ? f[0] : f;

      if (!file) return reject(new Error("Missing file (field name: file)"));
      resolve({ fields: fields as any, file });
    });
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

    if (!projectId) {
      json(res, 400, { ok: false, error: "Missing field: projectId" });
      return;
    }
    if (!floorId) {
      json(res, 400, { ok: false, error: "Missing field: floorId" });
      return;
    }

    const supabase = getSupabaseAdminClient();

    const { data: latestPlans, error: latestErr } = await supabase
      .from("plans")
      .select("version")
      .eq("project_id", projectId)
      .eq("floor_id", floorId)
      .order("version", { ascending: false })
      .limit(1);

    if (latestErr) {
      json(res, 500, { ok: false, error: `Failed to fetch current version: ${latestErr.message}` });
      return;
    }

    const latestVersionValue = latestPlans?.[0]?.version;
    const parsedVersion = Number(latestVersionValue);
    const currentVersion = Number.isFinite(parsedVersion) ? parsedVersion : 0;
    const version = currentVersion + 1;

    const tmpPath = (file as any).filepath as string | undefined;
    const originalName = (file as any).originalFilename as string | undefined;

    if (!tmpPath) {
      json(res, 400, { ok: false, error: "Upload failed: missing temp file path" });
      return;
    }

    // 1) Upload PDF to Supabase Storage
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

    // 4) Start tiles generation    // background tile generation
    generateTilesInBackground({
      targetFolderId: planId,
      planIdToUpdate: planId,
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
