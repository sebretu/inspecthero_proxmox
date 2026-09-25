import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Get original dimensions (with EXIF auto-rotation)
    const meta = await sharp(buffer).rotate().metadata();
    const origW = meta.width || 1000;
    const origH = meta.height || 1000;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jsQR = require("jsqr");

    // Preprocessing strategies - mirroring what worked in Python/OpenCV tests
    // Proven winner: gray, scale 0.5, adaptive Gaussian block=21 C=2
    const strategies: Array<{ label: string; fn: () => Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> }> = [
      {
        label: "50% grayscale",
        fn: async () => {
          const w = Math.round(origW * 0.5);
          const h = Math.round(origH * 0.5);
          const { data: px, info } = await sharp(buffer).rotate().resize(w, h).grayscale().raw().toBuffer({ resolveWithObject: true });
          return toRGBA(px, info.width, info.height);
        },
      },
      {
        label: "50% grayscale + adaptive(21,2)",
        fn: async () => {
          const w = Math.round(origW * 0.5);
          const h = Math.round(origH * 0.5);
          const { data: px, info } = await sharp(buffer).rotate().resize(w, h).grayscale().raw().toBuffer({ resolveWithObject: true });
          const bin = adaptiveThreshold(px, info.width, info.height, 21, 2);
          return toRGBA(bin, info.width, info.height);
        },
      },
      {
        label: "1000px grayscale",
        fn: async () => {
          const { data: px, info } = await sharp(buffer).rotate().resize({ width: 1000, fit: "inside" }).grayscale().raw().toBuffer({ resolveWithObject: true });
          return toRGBA(px, info.width, info.height);
        },
      },
      {
        label: "1000px adaptive(21,2)",
        fn: async () => {
          const { data: px, info } = await sharp(buffer).rotate().resize({ width: 1000, fit: "inside" }).grayscale().raw().toBuffer({ resolveWithObject: true });
          const bin = adaptiveThreshold(px, info.width, info.height, 21, 2);
          return toRGBA(bin, info.width, info.height);
        },
      },
      {
        label: "75% adaptive(21,2)",
        fn: async () => {
          const w = Math.round(origW * 0.75);
          const h = Math.round(origH * 0.75);
          const { data: px, info } = await sharp(buffer).rotate().resize(w, h).grayscale().raw().toBuffer({ resolveWithObject: true });
          const bin = adaptiveThreshold(px, info.width, info.height, 21, 2);
          return toRGBA(bin, info.width, info.height);
        },
      },
      {
        label: "1000px adaptive(31,5)",
        fn: async () => {
          const { data: px, info } = await sharp(buffer).rotate().resize({ width: 1000, fit: "inside" }).grayscale().raw().toBuffer({ resolveWithObject: true });
          const bin = adaptiveThreshold(px, info.width, info.height, 31, 5);
          return toRGBA(bin, info.width, info.height);
        },
      },
      {
        label: "50% adaptive(11,2)",
        fn: async () => {
          const w = Math.round(origW * 0.5);
          const h = Math.round(origH * 0.5);
          const { data: px, info } = await sharp(buffer).rotate().resize(w, h).grayscale().raw().toBuffer({ resolveWithObject: true });
          const bin = adaptiveThreshold(px, info.width, info.height, 11, 2);
          return toRGBA(bin, info.width, info.height);
        },
      },
    ];

    for (const strategy of strategies) {
      try {
        const { rgba, width, height } = await strategy.fn();
        const result = jsQR(rgba, width, height, { inversionAttempts: "attemptBoth" });
        if (result && result.data) {
          console.log(`[decode-qr] OK [${strategy.label}]: ${result.data}`);
          return NextResponse.json({ data: result.data });
        }
      } catch (e) {
        console.warn(`[decode-qr] Strategy "${strategy.label}" failed:`, e);
      }
    }

    return NextResponse.json({ error: "QR code not found" }, { status: 422 });
  } catch (err: any) {
    console.error("[decode-qr] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

function toRGBA(gray: Buffer | Uint8Array, width: number, height: number): { rgba: Uint8ClampedArray; width: number; height: number } {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = gray[i];
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

// Fast O(n) adaptive mean threshold using Summed Area Table
function adaptiveThreshold(gray: Buffer | Uint8Array, width: number, height: number, blockSize: number, C: number): Uint8Array {
  const sat = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      sat[idx] = gray[idx]
        + (x > 0 ? sat[idx - 1] : 0)
        + (y > 0 ? sat[idx - width] : 0)
        - (x > 0 && y > 0 ? sat[idx - width - 1] : 0);
    }
  }
  const half = Math.floor(blockSize / 2);
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(x - half, 0);
      const x2 = Math.min(x + half, width - 1);
      const y1 = Math.max(y - half, 0);
      const y2 = Math.min(y + half, height - 1);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      let sum = sat[y2 * width + x2];
      if (x1 > 0) sum -= sat[y2 * width + (x1 - 1)];
      if (y1 > 0) sum -= sat[(y1 - 1) * width + x2];
      if (x1 > 0 && y1 > 0) sum += sat[(y1 - 1) * width + (x1 - 1)];
      const idx = y * width + x;
      result[idx] = gray[idx] < sum / count - C ? 0 : 255;
    }
  }
  return result;
}
