#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function arg(name) {
  const p = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(p));
  return a ? a.slice(p.length) : null;
}

async function main() {
  const planId = arg("planId");
  if (!planId) throw new Error("missing --planId");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error("missing SUPABASE url/key envs");

  // 1) Pobierz plan z DB: storage_bucket + storage_path
  // Uwaga: tu korzystamy z Twojego API /api/plan
  const planRes = await fetch(`http://localhost:3000/api/plan?id=${planId}`);
  const planJson = await planRes.json();
  if (!planJson?.ok) throw new Error(`plan fetch failed: ${planJson?.error || planRes.status}`);
  const plan = planJson.data;

  const bucket = plan.storage_bucket;
  const storagePath = plan.storage_path;
  if (!bucket || !storagePath) throw new Error("plan missing storage_bucket/storage_path");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plan-"));
  const pdfPath = path.join(tmpDir, "plan.pdf");
  const pngPrefix = path.join(tmpDir, "plan");
  const pngPath = path.join(tmpDir, "plan.png");

  // 2) Download PDF z Supabase Storage (service key)
  {
    const dl = await fetch(`${url}/storage/v1/object/${bucket}/${storagePath}`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    if (!dl.ok) throw new Error(`pdf download failed: ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    await fs.writeFile(pdfPath, buf);
  }

  // 3) PDF -> PNG (150 DPI)
  await execFileAsync("pdftoppm", ["-png", "-r", "150", pdfPath, pngPrefix]);
  // zwykle powstaje plan-1.png
  await fs.copyFile(`${pngPrefix}-1.png`, pngPath);

  // 4) Generuj tiles (używa Twojego generatora)
  // ważne: uruchamiamy normalnie node, żeby logi były czytelne
  await execFileAsync("node", [
    "scripts/generate-tiles.mjs",
    `--planId=${planId}`,
    `--input=${pngPath}`,
    "--tileSize=256",
    "--minZoom=1",
    "--maxZoom=5",
  ], { cwd: process.cwd() });

  // 5) Zaktualizuj status planu w DB na READY przez Twoje API (albo bezpośrednio supabase)
  // Najprościej: użyj istniejącego endpointu (jeśli go masz) lub dodaj później.
  // Na teraz: jeśli w DB status i tak jest READY, możesz pominąć.
  // Tu tylko log:
  console.log(`[process-plan] tiles generated for ${planId}`);

  // sprzątanie
  await fs.rm(tmpDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error("[process-plan] ERROR:", e?.stack || e);
  process.exit(1);
});
