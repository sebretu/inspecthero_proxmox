import sharp from "sharp";

export interface CropV3Options {
  margin: number;
  canvasSize?: number;
}

/**
 * Creates a context-aware hybrid crop for V3 while preserving CAD relative scale.
 * 
 * Rules:
 * - If crop width <= canvasSize (256) and crop height <= canvasSize (256):
 *   Paste centered onto 256x256 white canvas WITHOUT enlarging (1:1 CAD scale preserved).
 * - If crop width > canvasSize or crop height > canvasSize:
 *   Scale down proportionally (contain fit) to 256x256.
 */
export async function createHybridCropV3(
  rawPlanImage: sharp.Sharp,
  cropBbox: { left: number; top: number; width: number; height: number },
  canvasSize: number = 256
): Promise<Buffer> {
  const extracted = await rawPlanImage.clone().extract(cropBbox).png().toBuffer();
  
  if (cropBbox.width <= canvasSize && cropBbox.height <= canvasSize) {
    const leftOffset = Math.round((canvasSize - cropBbox.width) / 2);
    const topOffset = Math.round((canvasSize - cropBbox.height) / 2);

    return sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: extracted, left: leftOffset, top: topOffset }])
      .png()
      .toBuffer();
  } else {
    return sharp(extracted)
      .resize(canvasSize, canvasSize, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toBuffer();
  }
}
