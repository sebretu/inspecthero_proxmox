import { LocationCoordinates } from "./native";

/**
 * Applies a watermark (date, time, location) to an image file.
 * Returns a new File object with the watermark "baked in".
 */
export async function applyWatermark(
    file: File,
    location: LocationCoordinates | null,
    language: string = "pl"
): Promise<File> {
    const timeoutPromise = new Promise<File>((resolve) => {
        setTimeout(() => resolve(file), 8000);
    });

    const watermarkProcess = async (): Promise<File> => {
        try {
            let width = 0;
            let height = 0;
            let sourceDrawable: CanvasImageSource | null = null;
            let cleanup: (() => void) | null = null;

            // 1. Try createImageBitmap for automatic EXIF orientation support on modern browsers
            if (typeof window !== "undefined" && "createImageBitmap" in window) {
                try {
                    const bitmap = await createImageBitmap(file);
                    if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
                        width = bitmap.width;
                        height = bitmap.height;
                        sourceDrawable = bitmap;
                        cleanup = () => bitmap.close?.();
                    }
                } catch (bitmapErr) {
                    console.warn("createImageBitmap fallback to Image:", bitmapErr);
                }
            }

            // 1.1 Fallback to standard Image if bitmap wasn't created
            if (!sourceDrawable) {
                const img = new Image();
                const imageUrl = URL.createObjectURL(file);
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = imageUrl;
                });
                width = img.naturalWidth || img.width;
                height = img.naturalHeight || img.height;
                sourceDrawable = img;
                cleanup = () => URL.revokeObjectURL(imageUrl);
            }

            if (!width || !height) {
                cleanup?.();
                return file;
            }

            // 1.5 Calculate dimensions (resize if too large, max 2.5K HD)
            const MAX_DIM = 2560;
            let targetWidth = width;
            let targetHeight = height;

            if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
                targetWidth = Math.round(targetWidth * ratio);
                targetHeight = Math.round(targetHeight * ratio);
            }

            // 2. Create a Canvas
            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                cleanup?.();
                return file;
            }

            // 3. Draw the original image
            ctx.drawImage(sourceDrawable, 0, 0, targetWidth, targetHeight);
            cleanup?.();

            // 4. Configure watermark style
            const fontSize = Math.max(14, Math.floor(canvas.height * 0.025));
            ctx.font = `bold ${fontSize}px sans-serif`;

            const now = new Date();
            const dateStr = now.toLocaleDateString(language === "pl" ? "pl-PL" : language === "de" ? "de-DE" : language === "sk" ? "sk-SK" : "en-US");
            const timeStr = now.toLocaleTimeString(language === "pl" ? "pl-PL" : language === "de" ? "de-DE" : language === "sk" ? "sk-SK" : "en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });

            const watermarkText = `${dateStr} ${timeStr}`;

            // 5. Draw background for the watermark (semi-transparent)
            const textMetrics = ctx.measureText(watermarkText);
            const padding = fontSize * 0.5;
            const bgHeight = fontSize + padding * 2;
            const bgWidth = textMetrics.width + padding * 2;

            // Position it at the bottom-right
            const x = canvas.width - bgWidth - padding;
            const y = canvas.height - bgHeight - padding;

            ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
            ctx.beginPath();
            const radius = 8;
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + bgWidth - radius, y);
            ctx.quadraticCurveTo(x + bgWidth, y, x + bgWidth, y + radius);
            ctx.lineTo(x + bgWidth, y + bgHeight - radius);
            ctx.quadraticCurveTo(x + bgWidth, y + bgHeight, x + bgWidth - radius, y + bgHeight);
            ctx.lineTo(x + radius, y + bgHeight);
            ctx.quadraticCurveTo(x, y + bgHeight, x, y + bgHeight - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();

            // 6. Draw the text
            ctx.fillStyle = "#ffffff";
            ctx.textBaseline = "middle";
            ctx.fillText(watermarkText, x + padding, y + bgHeight / 2);

            // 7. Convert back to File with 90% quality
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob((b) => resolve(b), "image/jpeg", 0.90);
            });

            if (!blob) {
                return file;
            }

            const rawName = file.name || "photo.jpg";
            const safeName = rawName.replace(/\.[^/.]+$/, "") + ".jpg";
            return new File([blob], safeName, { type: "image/jpeg", lastModified: Date.now() });
        } catch (err) {
            console.warn("applyWatermark failed, falling back to original file:", err);
            return file;
        }
    };

    return Promise.race([watermarkProcess(), timeoutPromise]);
}
