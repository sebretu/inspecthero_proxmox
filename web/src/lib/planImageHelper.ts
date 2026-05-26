import { getApiUrl } from "./apiClient";

export const urlToBase64 = async (url: string, token?: string | null): Promise<string | null> => {
    try {
        console.log(`Fetching image: ${url}`);
        const headers: RequestInit = {};

        if (token) {
            headers.headers = { Authorization: `Bearer ${token}` };
        }

        const response = await fetch(url, headers);

        if (!response.ok) {
            console.warn(`Fetch failed for ${url}: ${response.status}`);
            return null;
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image/")) {
            console.error(`Invalid content-type for ${url}: ${contentType}`);
            return null;
        }

        const blob = await response.blob();
        if (blob.size === 0) {
            console.warn(`Empty blob for ${url}`);
            return null;
        }

        // 1. Convert Blob to Data URL
        const rawBase64 = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });

        if (!rawBase64) return null;

        return rawBase64;
    } catch (e) {
        console.error(`Error in urlToBase64 for ${url}:`, e);
        return null;
    }
};

export const getPlanImageBase64 = async (plan: any, token: string | null): Promise<string | null> => {
    let b64: string | null = null;
    if (plan.image_path) {
        b64 = await urlToBase64(getApiUrl(plan.image_path), token);
    }

    if (!b64) {
        try {
            console.log(`Fallback: Stitching high-res for ${plan.id.slice(0, 8)}...`);
            const metaRes = await fetch(getApiUrl(`/api/tiles/${plan.id}/meta`), {
                headers: token ? { "Authorization": `Bearer ${token}` } : {}
            });
            if (metaRes.ok) {
                const meta = await metaRes.json();
                const { minZoom, maxZoom, limits, tileSize = 256 } = meta;
                let bestZoom = minZoom;
                for (let z = minZoom; z <= maxZoom; z++) {
                    const lim = limits[z];
                    if (!lim) continue;
                    if ((lim.maxX + 1) * tileSize >= 4000) {
                        bestZoom = z;
                        break;
                    }
                    bestZoom = z;
                }
                const lim = limits[bestZoom];
                if (lim && (lim.maxX + 1) * (lim.maxY + 1) <= 1000) {
                    const canvas = document.createElement('canvas');
                    canvas.width = (lim.maxX + 1) * tileSize;
                    canvas.height = (lim.maxY + 1) * tileSize;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = "#FFFFFF";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const tilePromises = [];
                        for (let x = 0; x <= lim.maxX; x++) {
                            for (let y = 0; y <= lim.maxY; y++) {
                                const tUrl = getApiUrl(`/api/tiles/${plan.id}/${bestZoom}/${x}/${y}.png`);
                                tilePromises.push((async () => {
                                    const tB64 = await urlToBase64(tUrl, token);
                                    if (tB64) {
                                        const img = new window.Image();
                                        await new Promise<void>((resolve) => {
                                            img.onload = () => resolve();
                                            img.onerror = () => resolve();
                                            img.src = tB64;
                                        });
                                        ctx.drawImage(img, x * tileSize, y * tileSize);
                                    }
                                })());
                            }
                        }
                        await Promise.all(tilePromises);

                        const MAX_PLAN_DIM = 3072;
                        let logicalW = plan.image_width ? plan.image_width / Math.pow(2, (meta.maxZoom - bestZoom)) : canvas.width;
                        let logicalH = plan.image_height ? plan.image_height / Math.pow(2, (meta.maxZoom - bestZoom)) : canvas.height;

                        let finalW = logicalW;
                        let finalH = logicalH;
                        if (finalW > MAX_PLAN_DIM || finalH > MAX_PLAN_DIM) {
                            const ratio = Math.min(MAX_PLAN_DIM / finalW, MAX_PLAN_DIM / finalH);
                            finalW = Math.round(finalW * ratio);
                            finalH = Math.round(finalH * ratio);
                        }

                        const finalCanvas = document.createElement('canvas');
                        finalCanvas.width = finalW;
                        finalCanvas.height = finalH;
                        const ctx2 = finalCanvas.getContext('2d');
                        if (ctx2) {
                            ctx2.fillStyle = "#FFFFFF";
                            ctx2.fillRect(0, 0, finalW, finalH);
                            ctx2.drawImage(canvas, 0, 0, logicalW, logicalH, 0, 0, finalW, finalH);
                            b64 = finalCanvas.toDataURL("image/jpeg", 0.7);
                        } else {
                            b64 = canvas.toDataURL("image/jpeg", 0.7);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Stitching failed for ${plan.id}`, e);
        }
    }
    return b64;
};
