/**
 * Helper to automatically trigger a download for a local file to the device.
 * Used for explicitly saving captured or uploaded photos in web browsers.
 */
export async function downloadLocalPhoto(file: File) {
    try {
        const fileType = file.type || 'image/jpeg';
        let ext = "jpg";
        if (fileType.includes("png")) ext = "png";
        else if (fileType.includes("webp")) ext = "webp";

        const rawName = (file.name || "capture").split('.')[0];
        const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = `${safeName}_${timestamp}.${ext}`;

        // Ensure the file object has the correct name and type
        const cleanFile = new File([file], fileName, { type: fileType });

        // 1. FLUTTER BRIDGE (InAppWebView)
        if ((window as any).flutter_inappwebview) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result !== "string") return;
                const pureBase64 = reader.result.split(',')[1] || reader.result;
                (window as any).flutter_inappwebview.callHandler('onBlobDataReceived', pureBase64, fileName);
            };
            reader.readAsDataURL(cleanFile);
            return;
        }

        // 2. NATIVE SHARE (iOS Safari / PWA / Android)
        // Best for iPhone gallery saving
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [cleanFile] })) {
            try {
                await navigator.share({
                    files: [cleanFile],
                    title: fileName,
                });
                return;
            } catch (err) {
                console.warn("Share failed, falling back to download link", err);
            }
        }

        // 3. BLOB DOWNLOAD (Fallback)
        const url = URL.createObjectURL(cleanFile);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        // Cleanup after a short delay
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

    } catch (e) {
        console.error("Local save preparation failed", e);
    }
}
