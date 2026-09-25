import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: { bodyParser: { sizeLimit: "25mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { imageBase64, imageUrl } = req.body;

  if (!imageBase64 && !imageUrl) {
    return res.status(400).json({ error: "No image provided" });
  }

  const localAiUrl = process.env.LOCAL_AI_URL || "http://192.168.178.4:8000";
  const localAiKey = process.env.LOCAL_AI_KEY || "e06be799d068c8c841338aaf7808bb84e6b4444e9aa813174a5681c00f931631";

  try {
    // 60-second timeout for local AI OCR deep inference
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const localRes = await fetch(`${localAiUrl.replace(/\/+$/, "")}/vision/scan-serial`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(localAiKey ? { "X-API-Key": localAiKey } : {}),
      },
      body: JSON.stringify({ imageBase64, imageUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!localRes.ok) {
      const errText = await localRes.text().catch(() => "");
      return res.status(localRes.status).json({
        error: `Local AI OCR returned status ${localRes.status}: ${errText || localRes.statusText}`,
      });
    }

    const localData = await localRes.json();
    const raw = localData?.serialNumber || localData?.raw || "";

    // Clean up prefixes (S/N, Serial:, Seriennummer:, whitespace, markdown)
    let serialNumber = (raw || "")
      .replace(/```[a-z]*\n?|```/gi, "")
      .replace(/^[\"\'`]+|[\"\'`]+$/g, "")
      .replace(/^(serial\s*(number)?|seriennummer|s\/n|sn|ser\.?\s*nr\.?|fabr\.?\s*nr\.?|prod\.?\s*nr\.?):?\s*/i, "")
      .replace(/\s+/g, "")
      .trim();

    if (serialNumber.toUpperCase() === "UNKNOWN" || serialNumber.length < 2) {
      serialNumber = "";
    }

    return res.status(200).json({
      serialNumber: serialNumber || null,
      raw: localData?.raw || raw,
      source: "local_ai",
      method: localData?.method || "vision_ocr",
      inference_time_ms: localData?.inference_time_ms,
    });
  } catch (err: any) {
    console.error("[scan-serial] Local AI OCR error:", err);
    const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
    return res.status(500).json({
      error: isTimeout
        ? "Local AI OCR przekroczył limit czasu (60s). Spróbuj ponownie lub zrób wyraźniejsze zdjęcie."
        : `Błąd lokalnego AI: ${err.message || "Nieznany błąd"}`,
    });
  }
}


