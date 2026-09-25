import crypto from "crypto";
import os from "os";
import path from "path";
import fsSync from "fs";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const execFileAsync = promisify(execFile);

async function flattenPngToWhite(inputPng: string, outputPng: string) {
  try {
    await execFileAsync("convert", [inputPng, "-background", "white", "-alpha", "remove", "-alpha", "off", outputPng]);
  } catch (e: any) {
    if (inputPng !== outputPng) {
      await fs.copyFile(inputPng, outputPng);
    }
  }
}

async function flattenTilesDirToWhite(dir: string) {
  try {
    const walk = async (p: string) => {
      const entries = await fs.readdir(p, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(p, ent.name);
        if (ent.isDirectory()) {
          await walk(full);
        } else if (ent.isFile()) {
          if (!ent.name.toLowerCase().endsWith(".png")) continue;
          if (ent.name === "blank.png") continue;
          try {
            await execFileAsync("mogrify", ["-background", "white", "-alpha", "remove", "-alpha", "off", full]);
          } catch (e: any) {
            try {
              const tmp = full + ".tmp.png";
              await execFileAsync("convert", [full, "-background", "white", "-alpha", "remove", "-alpha", "off", tmp]);
              await fs.rename(tmp, full);
            } catch (e2) {}
          }
        }
      }
    };
    await walk(dir);
  } catch (e) {}
}

export async function generateTilesInBackground(opts: {
  targetFolderId: string; // The folder name inside private_tiles/
  planIdToUpdate?: string; // If provided, update this plan's DB record
  versionIdToUpdate?: string; // If provided, update this version's DB record
  pdfPathOnDisk: string; // local tmp file path
  dpi: number;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}) {
  const supabase = getSupabaseAdminClient();
  (async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "tiles-"));
    const pngBase = path.join(workDir, "page");

    try {
      await execFileAsync("pdftoppm", ["-png", "-r", String(opts.dpi), opts.pdfPathOnDisk, pngBase]);
      const page1 = `${pngBase}-1.png`;
      const planPng = path.join(workDir, "plan.png");
      await flattenPngToWhite(page1, planPng);

      const webRoot = process.cwd();
      await execFileAsync("node", [
        path.join(webRoot, "scripts", "generate-tiles.mjs"),
        `--planId=${opts.targetFolderId}`,
        `--input=${planPng}`,
        `--tileSize=${opts.tileSize}`,
        `--minZoom=${opts.minZoom}`,
        `--maxZoom=${opts.maxZoom}`,
      ]);

      const tilesDir = path.join(webRoot, "private_tiles", opts.targetFolderId);
      if (fsSync.existsSync(tilesDir)) {
        await flattenTilesDirToWhite(tilesDir);
      }

      const metaPath = path.join(tilesDir, "meta.json");
      if (fsSync.existsSync(metaPath)) {
        try {
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent);
          if (meta.imageWidth && meta.imageHeight) {
            if (opts.planIdToUpdate) {
              await supabase.from("plans").update({
                image_width: meta.imageWidth,
                image_height: meta.imageHeight,
                processing_error: null
              }).eq("id", opts.planIdToUpdate);
            }
            if (opts.versionIdToUpdate) {
              await supabase.from("plan_versions").update({
                width_px: meta.imageWidth,
                height_px: meta.imageHeight,
              }).eq("id", opts.versionIdToUpdate);
            }
          }
        } catch (e) {
            // clear error
        }
      }
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    } catch (e: any) {
      if (opts.planIdToUpdate) {
        await supabase.from("plans").update({ processing_error: `tiles error: ${e.message}` }).eq("id", opts.planIdToUpdate);
      }
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  })();
}
