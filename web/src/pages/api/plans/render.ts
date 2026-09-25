import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { plan_id, dpi: dpiQuery } = req.query;

  if (!plan_id || typeof plan_id !== "string") {
    return res.status(400).json({ error: "Missing plan_id query parameter" });
  }

  const dpi = Math.min(300, Math.max(100, Number(dpiQuery) || 200));

  const admin = getSupabaseAdminClient();

  // Define local cache folder under public so it is served quickly or read directly
  const cacheDir = path.join(process.cwd(), "public", "plan-renders");
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFilePath = path.join(cacheDir, `${plan_id}_${dpi}.png`);

  try {
    // 1. Check if cached version exists
    try {
      const stat = await fs.stat(cacheFilePath);
      if (stat.isFile()) {
        const cachedImg = await fs.readFile(cacheFilePath);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // Cache for 7 days
        return res.status(200).send(cachedImg);
      }
    } catch {}

    // 2. Fetch the plan storage path
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("storage_path")
      .eq("id", plan_id)
      .single();

    if (planErr || !plan || !plan.storage_path) {
      return res.status(404).json({ error: `Plan ${plan_id} not found.` });
    }

    // 3. Download the PDF file from plans bucket
    const { data: pdfData, error: dlErr } = await admin.storage
      .from("plans")
      .download(plan.storage_path);

    if (dlErr || !pdfData) {
      return res.status(404).json({ error: `PDF file not found in storage for plan ${plan_id}` });
    }

    // 4. Render PDF to PNG using pdftoppm (e.g. 200 DPI for razor sharp quality)
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "render-"));
    const pdfPath = path.join(workDir, "input.pdf");

    try {
      const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
      await fs.writeFile(pdfPath, pdfBuffer);

      const pngBase = path.join(workDir, "page");
      await execFileAsync("pdftoppm", ["-png", "-r", String(dpi), pdfPath, pngBase]);
      const page1Png = `${pngBase}-1.png`;

      const flattenedPng = path.join(workDir, "flattened.png");
      try {
        await execFileAsync("convert", [page1Png, "-background", "white", "-alpha", "remove", "-alpha", "off", flattenedPng]);
      } catch {
        await fs.copyFile(page1Png, flattenedPng);
      }

      const finalPng = await fs.readFile(flattenedPng);
      
      // Save rendered PNG to cache
      await fs.writeFile(cacheFilePath, finalPng);

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      return res.status(200).send(finalPng);
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err: any) {
    console.error("[Plan Render API] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
