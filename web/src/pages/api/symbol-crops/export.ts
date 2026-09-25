import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { execSync } from "child_process";
import path from "path";
import fs from "fs/promises";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { plan_id, symbol_type, quality } = req.query;
  const admin = getSupabaseAdminClient();

  try {
    let dbQuery = admin.from("symbol_crops").select("*");

    // Apply quality filter (defaults to "passed" unless requested otherwise)
    if (quality) {
      if (quality !== "all") {
        dbQuery = dbQuery.eq("quality_status", quality);
      }
    } else {
      dbQuery = dbQuery.eq("quality_status", "passed");
    }

    if (plan_id) {
      dbQuery = dbQuery.eq("plan_id", plan_id);
    }

    if (symbol_type) {
      dbQuery = dbQuery.eq("symbol_type", symbol_type);
    }

    const { data: crops, error } = await dbQuery;

    if (error) {
      throw error;
    }

    // Map each crop to the requested JSONL line format
    const lines = (crops || []).map(crop => {
      const prompt = crop.clip_prompt || {};
      return JSON.stringify({
        image: crop.image_path,
        prompt: {
          symbol: prompt.symbol || "electrical plan symbol",
          type: crop.symbol_type || prompt.type || "socket",
          circuit_code: prompt.circuit_code || crop.metadata?.circuit_code || "",
          cable: prompt.cable || crop.metadata?.kabeltyp || "",
          breaker: prompt.breaker || prompt.circuit || ""
        },
        metadata: {
          plan_id: crop.plan_id,
          stromkreis_id: crop.stromkreis_id,
          quality_score: Number(crop.quality_score || 0)
        }
      });
    });

    const fileContent = lines.join("\n") + "\n";

    // --- DATASET VERSIONING WORKFLOW ---
    // 1. Generate version tag and paths
    const versionTag = `v_${Date.now()}`;
    const exportsDir = path.join(process.cwd(), "public", "exports");
    await fs.mkdir(exportsDir, { recursive: true });
    
    const fileName = `dataset_${versionTag}.jsonl`;
    const fullFilePath = path.join(exportsDir, fileName);
    const exportPath = `/exports/${fileName}`;

    // 2. Write file to public storage folder
    await fs.writeFile(fullFilePath, fileContent);

    // 3. Resolve git commit hash
    let gitCommit = "unknown";
    try {
      gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    } catch (gitErr) {
      // Ignore git read error in sandbox
    }

    // 4. Save metadata version to dataset_versions table
    const planCount = new Set((crops || []).map(c => c.plan_id)).size;
    
    await admin.from("dataset_versions").insert({
      version: versionTag,
      git_commit: gitCommit,
      embedding_model: "local-768-feature-v1",
      symbol_count: crops?.length || 0,
      plan_count: planCount,
      export_path: exportPath
    });

    // Send Ndjson file attachment
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    
    return res.status(200).send(fileContent);
  } catch (err: any) {
    console.error("[Dataset Export] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
