#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

function md5File(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash("md5").update(buf).digest("hex");
}

async function walkPngFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".png")) out.push(full);
    }
  }
  return out;
}

async function main() {
  const planId = process.argv[2];
  if (!planId) {
    console.error("Użycie: node scripts/fix-tiles.js <planId>");
    process.exit(1);
  }

  const base = path.join(process.cwd(), "public", "tiles", planId);
  const metaPath = path.join(base, "meta.json");
  const blankPath = path.join(base, "blank.png");

  if (!fs.existsSync(base)) throw new Error(`Brak katalogu planu: ${base}`);
  if (!fs.existsSync(metaPath)) throw new Error(`Brak meta.json: ${metaPath}`);
  if (!fs.existsSync(blankPath)) throw new Error(`Brak blank.png: ${blankPath}`);

  const meta = JSON.parse(await fsp.readFile(metaPath, "utf8"));
  const blankMd5 = md5File(blankPath);

  const minZoom = Number(meta.minZoom);
  const maxZoom = Number(meta.maxZoom);

  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) {
    throw new Error("meta.json nie ma minZoom/maxZoom");
  }

  console.log(`[fix-tiles] planId=${planId}`);
  console.log(`[fix-tiles] blankMd5=${blankMd5}`);
  console.log(`[fix-tiles] zoom range ${minZoom}..${maxZoom}`);

  const newLimits = {};

  for (let z = minZoom; z <= maxZoom; z++) {
    const zDir = path.join(base, String(z));
    if (!fs.existsSync(zDir)) {
      console.log(`[fix-tiles] z=${z}: brak katalogu`);
      continue;
    }

    // oczekujemy struktury: z/x/y.png
    const pngs = await walkPngFiles(zDir);

    let removed = 0;
    let kept = 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const p of pngs) {
      // wyciągnij x i y z path: .../<z>/<x>/<y>.png
      const rel = path.relative(zDir, p).replace(/\\/g, "/");
      const parts = rel.split("/");
      if (parts.length !== 2) continue;

      const xStr = parts[0];
      const yStr = parts[1].replace(/\.png$/i, "");

      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const h = md5File(p);
      if (h === blankMd5) {
        await fsp.unlink(p);
        removed++;
        continue;
      }

      kept++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    if (kept > 0) {
      newLimits[String(z)] = { minX, minY, maxX, maxY };
    } else {
      // jeżeli nic nie zostało, limit = -1
      newLimits[String(z)] = { minX: 0, minY: 0, maxX: -1, maxY: -1 };
    }

    console.log(
      `[fix-tiles] z=${z}: removedBlank=${removed} kept=${kept} limits=${JSON.stringify(newLimits[String(z)])}`
    );
  }

  // Aktualizujemy meta:
  // - zachowujemy stare pola
  // - nadpisujemy limits nowymi (z minX/minY!)
  meta.limits = newLimits;

  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
  console.log(`[fix-tiles] zapisano meta.json z nowymi limits: ${metaPath}`);
  console.log(`[fix-tiles] GOTOWE`);
}

main().catch((e) => {
  console.error("[fix-tiles] ERROR:", e?.message || e);
  process.exit(1);
});
