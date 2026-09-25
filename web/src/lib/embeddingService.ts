import sharp from "sharp";

/**
 * Generates a high-precision, deterministic 768-dimensional visual feature vector for CAD symbols.
 * 
 * Key Architectural Improvements:
 * - Line-Inverted: White background paper produces 0.0, so white tlo NEVER dominates the L2 norm.
 * - CAD Line Priority: Dark drawing lines, Sobel edge contours, and structural projections receive top weights.
 * - Color Feature Sub-vectors: Green (Sockets/EDVs) and Red (CEE) CAD channels are explicitly encoded.
 * - Resilient to anti-aliasing and minor spatial offsets.
 * - Maintains exact 768-dimension L2 normalization compatible with pgvector.
 *
 * Vector Composition (768 total dimensions):
 * - 256 dimensions: 16x16 Line Inverted intensity thumbnail [0..1]
 * - 256 dimensions: 16x16 Green CAD channel intensity thumbnail [0..1]
 * - 128 dimensions: 16x8 Red CAD channel intensity thumbnail [0..1]
 * - 64 dimensions: 8x8 Sobel edge gradient intensity map [0..1]
 * - 64 dimensions: 32 Horizontal + 32 Vertical structural projections [0..1]
 */
export async function generateImageEmbedding(imageInput: string | Buffer): Promise<number[]> {
  try {
    const rawImg = sharp(imageInput);

    // 1. Line-Inverted 16x16 thumbnail (256 values: white background = 0.0, CAD line = 1.0)
    const { data: rawRgb256, info: info256 } = await rawImg
      .clone()
      .resize(16, 16, { fit: "fill" })
      .toFormat("raw")
      .toBuffer({ resolveWithObject: true });

    const ch256 = info256.channels || 3;
    const line256Values: number[] = [];
    const green256Values: number[] = [];

    for (let i = 0; i < rawRgb256.length; i += ch256) {
      const r = rawRgb256[i], g = rawRgb256[i + 1], b = rawRgb256[i + 2];
      const lum = (r + g + b) / 3;

      // Inverted line intensity: white background (255) -> 0.0, dark CAD line -> up to 1.0
      const lineVal = Math.max(0, (245 - lum) / 245);
      line256Values.push(lineVal);

      // Green CAD channel feature (Socket / EDV)
      const greenVal = (g > 60 && g > r + 18 && g > b + 18) ? Math.min(1.0, (g - Math.max(r, b)) / 80) : 0;
      green256Values.push(greenVal);
    }

    // 2. Red CAD channel 16x8 thumbnail (128 values)
    const { data: rawRgb128, info: info128 } = await rawImg
      .clone()
      .resize(16, 8, { fit: "fill" })
      .toFormat("raw")
      .toBuffer({ resolveWithObject: true });

    const ch128 = info128.channels || 3;
    const red128Values: number[] = [];

    for (let i = 0; i < rawRgb128.length; i += ch128) {
      const r = rawRgb128[i], g = rawRgb128[i + 1], b = rawRgb128[i + 2];
      // Red CAD channel feature (CEE / Industrial)
      const redVal = (r > 60 && r > g + 18 && r > b + 18) ? Math.min(1.0, (r - Math.max(g, b)) / 80) : 0;
      red128Values.push(redVal);
    }

    // 3. Sobel Edge Gradient Map 8x8 (64 values)
    const gray8Buffer = await rawImg.clone().grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer();
    const edge64Values = new Array(64).fill(0);
    const w = 8, h = 8;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = (
          -gray8Buffer[(y - 1) * w + (x - 1)] + gray8Buffer[(y - 1) * w + (x + 1)] +
          -2 * gray8Buffer[y * w + (x - 1)] + 2 * gray8Buffer[y * w + (x + 1)] +
          -gray8Buffer[(y + 1) * w + (x - 1)] + gray8Buffer[(y + 1) * w + (x + 1)]
        );
        const gy = (
          -gray8Buffer[(y - 1) * w + (x - 1)] - 2 * gray8Buffer[(y - 1) * w + x] - gray8Buffer[(y - 1) * w + (x + 1)] +
          gray8Buffer[(y + 1) * w + (x - 1)] + 2 * gray8Buffer[(y + 1) * w + x] + gray8Buffer[(y + 1) * w + (x + 1)]
        );
        edge64Values[y * w + x] = Math.min(1.0, Math.sqrt(gx * gx + gy * gy) / 255);
      }
    }

    // 4. Structural Line Projections (32 horizontal + 32 vertical = 64 values)
    const horProj = new Array(32).fill(0);
    const verProj = new Array(32).fill(0);
    const projBuffer = await rawImg.clone().grayscale().resize(32, 32, { fit: "fill" }).raw().toBuffer();

    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const val = Math.max(0, (245 - projBuffer[y * 32 + x]) / 245);
        horProj[y] += val;
        verProj[x] += val;
      }
    }
    const horProjNorm = horProj.map(v => Math.min(1.0, v / 32));
    const verProjNorm = verProj.map(v => Math.min(1.0, v / 32));
    const proj64Values = [...horProjNorm, ...verProjNorm];

    // Combine features into exact 768-dimension vector
    const vector = [
      ...line256Values,
      ...green256Values,
      ...red128Values,
      ...edge64Values,
      ...proj64Values
    ];

    // Padding/Trimming to ensure exact length 768
    while (vector.length < 768) {
      vector.push(0);
    }
    const finalVector = vector.slice(0, 768);

    // L2 normalization (vector length = 1.0)
    const sumSq = finalVector.reduce((sum, val) => sum + val * val, 0);
    const magnitude = Math.sqrt(sumSq);
    if (magnitude > 0) {
      return finalVector.map(v => Number((v / magnitude).toFixed(6)));
    }
    return finalVector;
  } catch (err: any) {
    console.error("[generateImageEmbedding] failed:", err.message);
    throw err;
  }
}

/**
 * Convenience helper: downloads a crop from Supabase Storage and generates its embedding.
 */
export async function generateImageEmbeddingFromStoragePath(
  storagePath: string
): Promise<number[]> {
  const { getSupabaseAdminClient } = await import("@/lib/supabaseAdmin");
  const supabase = getSupabaseAdminClient();
  const bucket = "symbol-crops";
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    throw new Error(`Cannot download crop for embedding: ${error?.message}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return generateImageEmbedding(buffer);
}
