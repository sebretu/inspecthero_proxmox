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

function pngResponse(buf: Buffer, debugPath: string) {
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0",
      "X-TILES-HANDLER": "app-router",
      "X-TILE-PATH": debugPath,
      "Content-Length": String(buf.length),
    },
  });
}

function transparent() {
  return pngResponse(TRANSPARENT_PNG, "TRANSPARENT");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ planId: string; z: string; x: string; y: string }> }
) {
  try {
    const { planId, z, x, y } = await ctx.params;

    const planIdStr = String(planId);
    const zNum = parseInt(String(z), 10);
    const xNum = parseInt(String(x), 10);

    // y w URL może przyjść jako "2.png" albo "-2.png"
    const yRaw = String(y);
    const yNum = parseInt(yRaw.replace(/\.png$/i, ""), 10);

    if (!Number.isFinite(zNum) || !Number.isFinite(xNum) || !Number.isFinite(yNum)) {
      return transparent();
    }

    const base = path.join(process.cwd(), "public", "tiles", planIdStr);
    const metaPath = path.join(base, "meta.json");

    // Jeśli meta jeszcze nie ma (processing) → transparent (bez 404 spam)
    if (!fs.existsSync(metaPath)) {
      return transparent();
    }

    let meta: Meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Meta;
    } catch {
      return transparent();
    }

    // Ograniczanie zakresu: jeśli mamy limits, użyj ich
    const lim = meta.limits?.[String(zNum)];
    if (lim) {
      if (xNum < 0 || yNum < 0 || xNum > lim.maxX || yNum > lim.maxY) {
        return transparent();
      }
    } else {
      // Bez limits: ujemne uznajemy za “poza mapą”
      if (xNum < 0 || yNum < 0) {
        return transparent();
      }
    }

    const tilePath = path.join(base, String(zNum), String(xNum), `${yNum}.png`);
    if (!fs.existsSync(tilePath)) {
      return transparent();
    }

    const buf = fs.readFileSync(tilePath);
    return pngResponse(buf, tilePath);
  } catch (e) {
    console.error("[tiles app] error:", e);
    return transparent();
  }
}

export async function HEAD(
  _req: Request,
  ctx: { params: Promise<{ planId: string; z: string; x: string; y: string }> }
) {
  // odpowiadamy jak GET, ale bez ciała
  const r = await GET(_req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
