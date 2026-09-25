import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import formidable from "formidable";
import os from "os";
import path from "path";
import fs from "fs/promises";

export const config = {
  api: {
    bodyParser: false, // IMPORTANT for multipart/form-data
  },
};

async function parseMultipart(req: NextApiRequest): Promise<{ fields: any; file: any }> {
  const form = formidable({
    multiples: false,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFileSize: 200 * 1024 * 1024, // 200MB
    filter: (part: any) => {
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
      resolve({ fields, file });
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.authorization || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing Bearer token" });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return res.status(401).json({ error: "AUTH_INVALID" });

  const planId = req.query.id as string;
  if (!planId) return res.status(400).json({ error: "Missing planId" });

  const adminClient = getSupabaseAdminClient();

  try {
    const { fields, file } = await parseMultipart(req);
    const tmpPath = file.filepath as string;

    // 1. Fetch Plan to get context
    const { data: plan, error: planErr } = await adminClient
      .from("plans")
      .select("project_id, floor_id, active_migration_id")
      .eq("id", planId)
      .single();

    if (planErr || !plan) return res.status(404).json({ error: "Plan not found" });

    if (plan.active_migration_id) {
      return res.status(409).json({ error: "Another migration is currently in progress." });
    }

    // 2. Determine Next Version Number
    const { data: versions, error: vErr } = await adminClient
      .from("plan_versions")
      .select("version_number")
      .eq("plan_id", planId)
      .order("version_number", { ascending: false })
      .limit(1);

    if (vErr) return res.status(500).json({ error: "Failed to fetch versions" });
    if (!versions || versions.length === 0) {
      return res.status(400).json({ error: "Versioning not enabled for this plan. Please enable versioning first." });
    }

    const nextVersion = versions[0].version_number + 1;

    // 3. Upload to Storage
    const storageBucket = "plans";
    const storagePath = `projects/${plan.project_id}/floors/${plan.floor_id}/plan_${planId}_v${nextVersion}.pdf`;
    const pdfBytes = await fs.readFile(tmpPath);

    const up = await adminClient.storage.from(storageBucket).upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (up.error) return res.status(500).json({ error: `Storage upload failed: ${up.error.message}` });

    // 4. Create Plan Version (Needs Alignment)
    const { data: newVersion, error: insErr } = await adminClient
      .from("plan_versions")
      .insert({
        plan_id: planId,
        version_number: nextVersion,
        file_url: path.basename(storagePath),
        status: 'needs_alignment'
      })
      .select("id")
      .single();

    if (insErr) return res.status(500).json({ error: `Failed to insert version: ${insErr.message}` });

    // 5. Set active_migration_id
    await adminClient
      .from("plans")
      .update({ active_migration_id: newVersion.id })
      .eq("id", planId);

    // 6. Audit Event
    await adminClient.from("audit_events").insert({
      event_type: 'draft_version_uploaded',
      user_id: user.id,
      resource_id: planId,
      resource_type: 'plan',
      metadata: { version_id: newVersion.id, version_number: nextVersion }
    });

    // 7. Start tiles generation in background
    import("@/lib/tileGenerator").then(({ generateTilesInBackground }) => {
      generateTilesInBackground({
        targetFolderId: newVersion.id, // Store tiles in a folder named after the version ID
        versionIdToUpdate: newVersion.id, // Update version dimensions when done
        pdfPathOnDisk: tmpPath,
        dpi: 150,
        tileSize: 256,
        minZoom: 1,
        maxZoom: 5,
      });
    });

    return res.status(200).json({
      ok: true,
      data: {
        draft_version_id: newVersion.id,
        version_number: nextVersion,
        status: 'needs_alignment'
      }
    });
  } catch (err: any) {
    console.error("[upload-version] Internal error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
