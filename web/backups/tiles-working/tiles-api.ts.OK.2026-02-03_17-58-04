import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

function sendPng(res: NextApiResponse, filePath: string) {
  const stat = fs.statSync(filePath);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=0");
  res.setHeader("X-TILES-HANDLER", "1");
  res.setHeader("X-TILE-PATH", filePath);
  res.setHeader("Content-Length", String(stat.size));

  if (res.req?.method === "HEAD") {
    res.status(200).end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { planId, z, x, y } = req.query;

    const planIdStr = String(planId);
    const zNum = parseInt(String(z), 10);
    const xNum = parseInt(String(x), 10);

    // y w URL może przyjść jako "2.png" albo "-2.png"
    const yRaw = String(y);
    const yNum = parseInt(yRaw.replace(/\.png$/i, ""), 10);

    if (!Number.isFinite(zNum) || !Number.isFinite(xNum) || !Number.isFinite(yNum)) {
      res.status(400).end();
      return;
    }

    const base = path.join(process.cwd(), "public", "tiles", planIdStr);
    const metaPath = path.join(base, "meta.json");

    if (!fs.existsSync(metaPath)) {
      res.status(404).end();
      return;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Meta;

    // szybkie sanity-check (opcjonalne ograniczanie zakresu)
    const lim = meta.limits?.[String(zNum)];
    if (lim) {
      if (xNum < 0 || yNum < 0 || xNum > lim.maxX || yNum > lim.maxY) {
        res.status(404).end();
        return;
      }
    }

    const tilePath = path.join(base, String(zNum), String(xNum), `${yNum}.png`);
    if (!fs.existsSync(tilePath)) {
      res.status(404).end();
      return;
    }

    sendPng(res, tilePath);
  } catch (e: any) {
    console.error("[tiles] error:", e);
    res.status(500).end();
  }
}
