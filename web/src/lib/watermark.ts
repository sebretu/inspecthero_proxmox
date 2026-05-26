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
    // 1. Create an Image object from the file
    const img = new Image();
    const imageUrl = URL.createObjectURL(file);

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
    });

    URL.revokeObjectURL(imageUrl);

    // 1.5 Calculate dimensions (resize if too large)
    const MAX_DIM = 1600;
    let width = img.width;
    let height = img.height;

    if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    // 2. Create a Canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
        throw new Error("Could not get canvas context");
    }

    // 3. Draw the original image
    ctx.drawImage(img, 0, 0, width, height);

    // 4. Configure watermark style
    // We want the text to be readable regardless of image size
    const fontSize = Math.max(12, Math.floor(canvas.height * 0.025));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const now = new Date();
    const dateStr = now.toLocaleDateString(language === "pl" ? "pl-PL" : language === "de" ? "de-DE" : "en-US");
    const timeStr = now.toLocaleTimeString(language === "pl" ? "pl-PL" : language === "de" ? "de-DE" : "en-US", {
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

    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    // Round corners for a nicer look
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
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.fillText(watermarkText, x + padding, y + bgHeight / 2);

    // 7. Convert back to File
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.75);
    });

    if (!blob) {
        throw new Error("Failed to create blob from canvas");
    }

    return new File([blob], file.name, { type: "image/jpeg" });
}
