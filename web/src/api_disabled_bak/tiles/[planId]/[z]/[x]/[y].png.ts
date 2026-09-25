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

// 1x1 przezroczysty PNG
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XrX1cAAAAASUVORK5CYII=",
  "base64"
);

function sendBufferPng(res: NextApiResponse, buf: Buffer, debugPath: string) {
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=0");
  res.setHeader("X-TILES-HANDLER", "1");
  res.setHeader("X-TILE-PATH", debugPath);
  res.setHeader("Content-Length", String(buf.length));

  if (res.req?.method === "HEAD") {
    res.status(200).end();
    return;
  }

  res.status(200).end(buf);
}

function sendTransparent(res: NextApiResponse) {
  return sendBufferPng(res, TRANSPARENT_PNG, "TRANSPARENT");
}

function sendFilePng(res: NextApiResponse, filePath: string) {
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
      return sendTransparent(res);
    }

    const base = path.join(process.cwd(), "public", "tiles", planIdStr);
    const metaPath = path.join(base, "meta.json");

    // Jeśli meta jeszcze nie ma (processing) → transparent (bez 404 spam)
    if (!fs.existsSync(metaPath)) {
      return sendTransparent(res);
    }

    let meta: Meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Meta;
    } catch {
      return sendTransparent(res);
    }

    // Ograniczanie zakresu: jeśli mamy limits, użyj ich
    const lim = meta.limits?.[String(zNum)];
    if (lim) {
      if (xNum < 0 || yNum < 0 || xNum > lim.maxX || yNum > lim.maxY) {
        return sendTransparent(res);
      }
    } else {
      // Bez limits: ujemne uznajemy za “poza mapą”
      if (xNum < 0 || yNum < 0) {
        return sendTransparent(res);
      }
    }

    const tilePath = path.join(base, String(zNum), String(xNum), `${yNum}.png`);

    if (!fs.existsSync(tilePath)) {
      return sendTransparent(res);
    }

    return sendFilePng(res, tilePath);
  } catch (e: any) {
    console.error("[tiles] error:", e);
    // nawet na error: transparent (żeby UI nie robiło “czerwieni”)
    return sendTransparent(res);
  }
}
